import { createClient } from '@supabase/supabase-js';
import { requireAdminSession } from '../_lib/adminAuth.js';

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

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.status(405).json({ ok: false, error: 'Method not allowed' });
    return;
  }

  try {
    requireAdminSession(req);
    const supabase = getSupabaseClient();

    const [
      customersRes,
      dogsRes,
      appointmentsRes,
      calendarEventsRes,
      tasksRes,
      whatsappMessagesRes,
      businessScheduleRes
    ] = await Promise.all([
      supabase.from('customers').select('*').order('id', { ascending: true }),
      supabase.from('dogs').select('*').order('id', { ascending: true }),
      supabase.from('appointments').select('*').order('date', { ascending: true }),
      supabase.from('calendar_events').select('*').order('starts_at', { ascending: true }),
      supabase.from('tasks').select('*').order('created_at', { ascending: false }),
      supabase
        .from('whatsapp_messages')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(300)
      ,
      supabase
        .from('business_schedule')
        .select('id, weekly_slots, max_booking_days_ahead, updated_at')
        .eq('id', 'default')
        .maybeSingle()
    ]);

    if (customersRes.error) {
      throw createHttpError(500, customersRes.error.message);
    }

    // dogs table is optional until the add_dogs_table migration is applied
    const dogsMissing =
      Boolean(dogsRes.error) &&
      typeof dogsRes.error?.message === 'string' &&
      dogsRes.error.message.toLowerCase().includes('relation') &&
      dogsRes.error.message.toLowerCase().includes('dogs');

    if (dogsRes.error && !dogsMissing) {
      throw createHttpError(500, dogsRes.error.message);
    }

    if (appointmentsRes.error) {
      throw createHttpError(500, appointmentsRes.error.message);
    }

    if (calendarEventsRes.error) {
      throw createHttpError(500, calendarEventsRes.error.message);
    }

    if (tasksRes.error) {
      throw createHttpError(500, tasksRes.error.message);
    }

    // whatsapp_messages table is optional (older DBs might not have it)
    const whatsappMessagesMissing =
      Boolean(whatsappMessagesRes.error) &&
      typeof whatsappMessagesRes.error?.message === 'string' &&
      whatsappMessagesRes.error.message.toLowerCase().includes('relation') &&
      whatsappMessagesRes.error.message.toLowerCase().includes('whatsapp_messages');

    if (whatsappMessagesRes.error && !whatsappMessagesMissing) {
      throw createHttpError(500, whatsappMessagesRes.error.message);
    }

    // business_schedule table is optional (older DBs might not have it)
    const businessScheduleMissing =
      Boolean(businessScheduleRes.error) &&
      typeof businessScheduleRes.error?.message === 'string' &&
      businessScheduleRes.error.message.toLowerCase().includes('relation') &&
      businessScheduleRes.error.message.toLowerCase().includes('business_schedule');

    if (businessScheduleRes.error && !businessScheduleMissing) {
      throw createHttpError(500, businessScheduleRes.error.message);
    }

    res.status(200).json({
      ok: true,
      serverTime: new Date().toISOString(),
      customers: customersRes.data || [],
      dogs: dogsMissing ? [] : dogsRes.data || [],
      dogsMissing,
      appointments: appointmentsRes.data || [],
      calendarEvents: calendarEventsRes.data || [],
      tasks: tasksRes.data || [],
      whatsappMessages: whatsappMessagesMissing ? [] : whatsappMessagesRes.data || [],
      whatsappMessagesMissing
      ,
      businessSchedule: businessScheduleMissing ? null : businessScheduleRes.data || null,
      businessScheduleMissing
    });
  } catch (error) {
    const statusCode =
      error && typeof error === 'object' && 'statusCode' in error
        ? Number((error).statusCode || 500)
        : 500;
    const message = error instanceof Error ? error.message : String(error);

    if (statusCode === 401 || statusCode === 403) {
      res.status(statusCode).json({ ok: false, error: message });
      return;
    }

    res.status(500).json({ ok: false, error: message || 'Server error' });
  }
}
