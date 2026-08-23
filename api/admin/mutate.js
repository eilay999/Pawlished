import { createClient } from '@supabase/supabase-js';
import { requireAdminSession } from '../_lib/adminAuth.js';
import { buildSlotDateFromLocal } from '../_lib/appointments.js';
import { cancelPendingRemindersForSource, createReminder } from '../_lib/reminders.js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const createHttpError = (statusCode, message) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const getSupabaseClient = () => {
  if (!supabaseUrl || !supabaseServiceKey) {
    throw createHttpError(500, 'Supabase service role not configured');
  }

  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false }
  });
};

const requireJsonBody = (req) => {
  if (!req.body || typeof req.body !== 'object') {
    throw createHttpError(400, 'Missing request body');
  }
  return req.body;
};

const normalizeTime = (value = '') => {
  const trimmed = String(value || '').trim();
  const match = trimmed.match(/^([01]?\d|2[0-3])(?::([0-5]\d))?$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2] || '0');
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
};

const normalizeDigits = (value = '') => String(value || '').replace(/\D/g, '');

const toWhatsAppNumber = (value = '') => {
  const digits = normalizeDigits(value);
  if (!digits) return '';
  if (digits.startsWith('972')) return digits;
  if (digits.startsWith('0')) return `972${digits.slice(1)}`;
  if (String(value || '').trim().startsWith('+')) return digits;
  return digits;
};

const ISRAEL_TIME_ZONE = 'Asia/Jerusalem';

const formatIsraelDate = (value) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: ISRAEL_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date(value));

const formatIsraelTime = (value) => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: ISRAEL_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  })
    .formatToParts(new Date(value))
    .filter((part) => part.type !== 'literal')
    .reduce((acc, part) => {
      acc[part.type] = part.value;
      return acc;
    }, {});

  return `${parts.hour}:${parts.minute}`;
};

const addDaysToIsraelDateString = (dateValue, offsetDays) => {
  const [year, month, day] = String(dateValue || '')
    .trim()
    .split('-')
    .map(Number);

  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return null;
  }

  const utcMidday = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  utcMidday.setUTCDate(utcMidday.getUTCDate() + Number(offsetDays || 0));
  return formatIsraelDate(utcMidday);
};

const reminderDayBeforeTimeDefault = '18:00';
const reminderDayBeforeTime =
  normalizeTime(process.env.REMINDER_DAY_BEFORE_TIME) || reminderDayBeforeTimeDefault;

const normalizeWeeklySlots = (input) => {
  const weeklySlots = input && typeof input === 'object' ? input : {};
  const normalized = {};

  for (let day = 0; day <= 6; day += 1) {
    const raw = weeklySlots[day] ?? weeklySlots[String(day)];
    const list = Array.isArray(raw) ? raw : [];
    const seen = new Set();
    list.forEach((time) => {
      const normalizedTime = normalizeTime(time);
      if (normalizedTime) {
        seen.add(normalizedTime);
      }
    });
    normalized[String(day)] = Array.from(seen).sort();
  }

  return normalized;
};

const normalizeMaxBookingDaysAhead = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 30;
  return Math.min(30, Math.max(1, Math.round(numeric)));
};

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ ok: false, error: 'Method not allowed' });
    return;
  }

  try {
    requireAdminSession(req);
    const supabase = getSupabaseClient();
    const body = requireJsonBody(req);
    const action = String(body.action || '').trim();

    if (!action) {
      res.status(400).json({ ok: false, error: 'Missing action' });
      return;
    }

    if (action === 'upsert_customer') {
      const customer = body.customer;
      if (!customer || typeof customer !== 'object') {
        throw createHttpError(400, 'Missing customer');
      }

      const { data, error } = await supabase.from('customers').upsert(customer).select('*').single();
      if (error) throw createHttpError(500, error.message);
      res.status(200).json({ ok: true, customer: data });
      return;
    }

    if (action === 'delete_customer') {
      const customerId = String(body.customerId || '').trim();
      if (!customerId) throw createHttpError(400, 'Missing customerId');

      const { error: apptError } = await supabase
        .from('appointments')
        .delete()
        .eq('customer_id', customerId);
      if (apptError) throw createHttpError(500, apptError.message);

      const { error: customerError } = await supabase.from('customers').delete().eq('id', customerId);
      if (customerError) throw createHttpError(500, customerError.message);

      res.status(200).json({ ok: true });
      return;
    }

    if (action === 'upsert_dog') {
      const dog = body.dog;
      if (!dog || typeof dog !== 'object') {
        throw createHttpError(400, 'Missing dog');
      }

      const { data, error } = await supabase.from('dogs').upsert(dog).select('*').single();
      if (error) throw createHttpError(500, error.message);
      res.status(200).json({ ok: true, dog: data });
      return;
    }

    if (action === 'delete_dog') {
      const dogId = String(body.dogId || '').trim();
      if (!dogId) throw createHttpError(400, 'Missing dogId');

      const { error } = await supabase.from('dogs').delete().eq('id', dogId);
      if (error) throw createHttpError(500, error.message);
      res.status(200).json({ ok: true });
      return;
    }

    if (action === 'upsert_grooming_record') {
      const record = body.record;
      if (!record || typeof record !== 'object') {
        throw createHttpError(400, 'Missing record');
      }

      const { data, error } = await supabase.from('grooming_records').upsert(record).select('*').single();
      if (error) throw createHttpError(500, error.message);
      res.status(200).json({ ok: true, record: data });
      return;
    }

    if (action === 'delete_grooming_record') {
      const recordId = String(body.recordId || '').trim();
      if (!recordId) throw createHttpError(400, 'Missing recordId');

      const { error } = await supabase.from('grooming_records').delete().eq('id', recordId);
      if (error) throw createHttpError(500, error.message);
      res.status(200).json({ ok: true });
      return;
    }

    if (action === 'upsert_appointment') {
      const appointment = body.appointment;
      if (!appointment || typeof appointment !== 'object') {
        throw createHttpError(400, 'Missing appointment');
      }

      const { data, error } = await supabase
        .from('appointments')
        .upsert(appointment)
        .select('*')
        .single();
      if (error) throw createHttpError(500, error.message);

      // Keep appointment reminders aligned with the latest date/status.
      try {
        if (data?.id) {
          await cancelPendingRemindersForSource({
            sourceKind: 'APPOINTMENT',
            sourceId: data.id,
            reminderKind: 'DAY_BEFORE'
          });

          if (String(data.status || '').toUpperCase() !== 'CANCELLED') {
            const { data: customerRow } = await supabase
              .from('customers')
              .select('name, phone, pet_name')
              .eq('id', data.customer_id)
              .maybeSingle();

            const customerPhone = toWhatsAppNumber(customerRow?.phone || '');
            if (customerPhone) {
              const localDate = formatIsraelDate(data.date);
              const localTime = formatIsraelTime(data.date);
              const dayBeforeLocalDate = addDaysToIsraelDateString(localDate, -1);

              if (dayBeforeLocalDate) {
                const computedRemindAt = buildSlotDateFromLocal(
                  dayBeforeLocalDate,
                  reminderDayBeforeTime,
                  ISRAEL_TIME_ZONE
                );

                const now = Date.now();
                const remindAt =
                  computedRemindAt instanceof Date && computedRemindAt.getTime() > now
                    ? computedRemindAt
                    : new Date(now + 60 * 1000);

                await createReminder({
                  sourceKind: 'APPOINTMENT',
                  sourceId: data.id,
                  phone: customerPhone,
                  title: (customerRow?.name || 'תור').toString().trim() || 'תור',
                  remindAt,
                  payload: {
                    reminderKind: 'DAY_BEFORE',
                    customerName: customerRow?.name || '',
                    petName: customerRow?.pet_name || '',
                    date: localDate,
                    time: localTime
                  }
                });
              }
            }
          }
        }
      } catch {
        // Reminder scheduling is best-effort; appointment updates should still succeed.
      }

      res.status(200).json({ ok: true, appointment: data });
      return;
    }

    if (action === 'delete_appointment') {
      const appointmentId = String(body.appointmentId || '').trim();
      if (!appointmentId) throw createHttpError(400, 'Missing appointmentId');

      try {
        await cancelPendingRemindersForSource({ sourceKind: 'APPOINTMENT', sourceId: appointmentId });
      } catch {
        // best-effort
      }

      const { error } = await supabase.from('appointments').delete().eq('id', appointmentId);
      if (error) throw createHttpError(500, error.message);
      res.status(200).json({ ok: true });
      return;
    }

    if (action === 'upsert_calendar_event') {
      const event = body.event;
      if (!event || typeof event !== 'object') {
        throw createHttpError(400, 'Missing event');
      }

      const { data, error } = await supabase
        .from('calendar_events')
        .upsert(event)
        .select('*')
        .single();
      if (error) throw createHttpError(500, error.message);
      res.status(200).json({ ok: true, event: data });
      return;
    }

    if (action === 'delete_calendar_event') {
      const eventId = String(body.eventId || '').trim();
      if (!eventId) throw createHttpError(400, 'Missing eventId');

      const { error } = await supabase.from('calendar_events').delete().eq('id', eventId);
      if (error) throw createHttpError(500, error.message);
      res.status(200).json({ ok: true });
      return;
    }

    if (action === 'insert_task') {
      const task = body.task;
      if (!task || typeof task !== 'object') {
        throw createHttpError(400, 'Missing task');
      }

      const { data, error } = await supabase.from('tasks').insert(task).select('*').single();
      if (error) throw createHttpError(500, error.message);
      res.status(200).json({ ok: true, task: data });
      return;
    }

    if (action === 'update_task_status') {
      const taskId = String(body.taskId || '').trim();
      const status = String(body.status || '').trim();
      if (!taskId) throw createHttpError(400, 'Missing taskId');
      if (status !== 'OPEN' && status !== 'DONE') {
        throw createHttpError(400, 'Invalid status');
      }

      const { data, error } = await supabase
        .from('tasks')
        .update({ status })
        .eq('id', taskId)
        .select('*')
        .single();
      if (error) throw createHttpError(500, error.message);
      res.status(200).json({ ok: true, task: data });
      return;
    }

    if (action === 'delete_task') {
      const taskId = String(body.taskId || '').trim();
      if (!taskId) throw createHttpError(400, 'Missing taskId');

      const { data, error } = await supabase.from('tasks').delete().eq('id', taskId).select('id').single();
      if (error || !data) throw createHttpError(500, error?.message || 'Task delete returned no row');
      res.status(200).json({ ok: true });
      return;
    }

    if (action === 'set_business_schedule') {
      const weeklySlots = normalizeWeeklySlots(body.weeklySlots);
      const maxBookingDaysAhead = normalizeMaxBookingDaysAhead(body.maxBookingDaysAhead);

      const { data, error } = await supabase
        .from('business_schedule')
        .upsert({
          id: 'default',
          weekly_slots: weeklySlots,
          max_booking_days_ahead: maxBookingDaysAhead
        })
        .select('*')
        .single();

      if (error || !data) throw createHttpError(500, error?.message || 'Failed to update schedule');
      res.status(200).json({ ok: true, businessSchedule: data });
      return;
    }

    res.status(400).json({ ok: false, error: 'Unknown action' });
  } catch (error) {
    const statusCode =
      error && typeof error === 'object' && 'statusCode' in error
        ? Number((error).statusCode || 500)
        : 500;
    const message = error instanceof Error ? error.message : String(error);

    if (statusCode === 401 || statusCode === 403 || statusCode === 400) {
      res.status(statusCode).json({ ok: false, error: message });
      return;
    }

    res.status(500).json({ ok: false, error: message || 'Server error' });
  }
}
