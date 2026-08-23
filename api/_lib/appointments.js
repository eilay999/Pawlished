import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { createReminder } from './reminders.js';

const ISRAEL_TIME_ZONE = 'Asia/Jerusalem';
const DEFAULT_SERVICE = 'תספורת';
export const APPOINTMENT_DURATION_MINUTES = 180;
export const APPOINTMENT_SLOT_INTERVAL_MINUTES = 30;

// Pawlished fixed weekly slots (small dogs only) as provided by the business.
// Note: JS weekday indexing: 0=Sunday ... 6=Saturday.
export const WEEKLY_BUSINESS_SLOTS = {
  0: ['07:00', '08:00'],
  1: ['09:00', '12:00', '15:00'],
  2: ['09:00', '12:00', '15:00'],
  3: ['08:00', '11:00', '14:00'],
  4: ['07:00', '08:00'],
  5: ['07:00', '08:00'],
  6: []
};

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const createHttpError = (statusCode, message) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

export const normalizeDigits = (value = '') => String(value).replace(/\D/g, '');

export const normalizePhoneForStorage = (value = '') => {
  const digits = normalizeDigits(value);
  if (!digits) return '';
  if (digits.startsWith('972')) return `0${digits.slice(3)}`;
  return digits;
};

const buildPhoneVariants = (value = '') => {
  const trimmed = String(value || '').trim();
  const digits = normalizeDigits(trimmed);
  const variants = new Set([trimmed, digits]);

  if (digits.startsWith('0')) {
    variants.add(`972${digits.slice(1)}`);
    variants.add(`+972${digits.slice(1)}`);
  } else if (digits.startsWith('972')) {
    variants.add(`0${digits.slice(3)}`);
    variants.add(`+${digits}`);
  } else if (trimmed.startsWith('+')) {
    variants.add(trimmed.slice(1));
  }

  return Array.from(variants).filter(Boolean);
};

const getSupabaseClient = () => {
  if (!supabaseUrl || !supabaseServiceKey) {
    throw createHttpError(500, 'Supabase service role not configured');
  }

  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false }
  });
};

const isValidDate = (value) => value instanceof Date && !Number.isNaN(value.getTime());

const getFormatterParts = (date, timeZone) => {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  });

  return formatter
    .formatToParts(date)
    .filter(part => part.type !== 'literal')
    .reduce((acc, part) => {
      acc[part.type] = part.value;
      return acc;
    }, {});
};

const normalizeDateString = (value = '') => {
  const trimmed = String(value || '').trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  const shortMatch = trimmed.match(/^(\d{1,2})[./-](\d{1,2})(?:[./-](\d{2,4}))?$/);
  if (!shortMatch) {
    throw createHttpError(400, 'Invalid date format. Use YYYY-MM-DD.');
  }

  const [, dayRaw, monthRaw, yearRaw] = shortMatch;
  const currentYear = new Date().getUTCFullYear();
  const year = yearRaw ? Number(yearRaw.length === 2 ? `20${yearRaw}` : yearRaw) : currentYear;
  const month = Number(monthRaw);
  const day = Number(dayRaw);

  if (month < 1 || month > 12 || day < 1 || day > 31) {
    throw createHttpError(400, 'Invalid date values.');
  }

  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
};

const normalizeTimeString = (value = '') => {
  const trimmed = String(value || '').trim();
  const match = trimmed.match(/^([01]?\d|2[0-3])(?::([0-5]\d))?$/);

  if (!match) {
    throw createHttpError(400, 'Invalid time format. Use HH:mm.');
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2] || '0');
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
};

const toWhatsAppNumber = (value = '') => {
  const digits = normalizeDigits(value);
  if (!digits) return '';
  if (digits.startsWith('972')) return digits;
  if (digits.startsWith('0')) return `972${digits.slice(1)}`;
  if (String(value || '').trim().startsWith('+')) return digits;
  return digits;
};

// Customers can only book up to 1 month ahead.
const MAX_BOOKING_DAYS_AHEAD = 30;
const businessScheduleCacheTtlSec = Number(process.env.BUSINESS_SCHEDULE_CACHE_TTL_SEC || 30);
let cachedBusinessSchedule = null;
let cachedBusinessScheduleAt = 0;

const reminderDayBeforeTimeDefault = '18:00';
const reminderDayBeforeTime = (() => {
  const raw = String(process.env.REMINDER_DAY_BEFORE_TIME || reminderDayBeforeTimeDefault).trim();
  try {
    return normalizeTimeString(raw);
  } catch {
    return reminderDayBeforeTimeDefault;
  }
})();

const normalizeTimeList = (values = []) => {
  const list = Array.isArray(values) ? values : [];
  const seen = new Set();

  list.forEach((raw) => {
    if (typeof raw !== 'string') return;
    const trimmed = raw.trim();
    if (!trimmed) return;
    try {
      seen.add(normalizeTimeString(trimmed));
    } catch {
      // ignore invalid times
    }
  });

  return Array.from(seen).sort();
};

const normalizeWeeklySlots = (input) => {
  const weeklySlots = input && typeof input === 'object' ? input : {};
  const normalized = {};

  for (let day = 0; day <= 6; day += 1) {
    const raw = weeklySlots[day] ?? weeklySlots[String(day)];
    normalized[day] = normalizeTimeList(raw);
  }

  return normalized;
};

const normalizeMaxDaysAhead = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return MAX_BOOKING_DAYS_AHEAD;
  return Math.min(MAX_BOOKING_DAYS_AHEAD, Math.max(1, Math.round(numeric)));
};

export const getAllTimeSlots = (weeklySlots = WEEKLY_BUSINESS_SLOTS) => {
  const values =
    weeklySlots && typeof weeklySlots === 'object' ? Object.values(weeklySlots) : [];
  return Array.from(new Set(values.flat().filter((t) => typeof t === 'string' && t.trim()))).sort();
};

export const loadBusinessSchedule = async () => {
  const ttlMs =
    Math.max(0, (Number.isFinite(businessScheduleCacheTtlSec) ? businessScheduleCacheTtlSec : 30)) *
    1000;

  if (cachedBusinessSchedule && ttlMs > 0 && Date.now() - cachedBusinessScheduleAt < ttlMs) {
    return cachedBusinessSchedule;
  }

  const supabase = getSupabaseClient();

  try {
    const { data, error } = await supabase
      .from('business_schedule')
      .select('weekly_slots, max_booking_days_ahead')
      .eq('id', 'default')
      .maybeSingle();

    if (error) {
      throw error;
    }

    const schedule = {
      weeklySlots: normalizeWeeklySlots(data?.weekly_slots || WEEKLY_BUSINESS_SLOTS),
      maxBookingDaysAhead: normalizeMaxDaysAhead(data?.max_booking_days_ahead)
    };

    cachedBusinessSchedule = schedule;
    cachedBusinessScheduleAt = Date.now();
    return schedule;
  } catch {
    const schedule = {
      weeklySlots: WEEKLY_BUSINESS_SLOTS,
      maxBookingDaysAhead: MAX_BOOKING_DAYS_AHEAD
    };

    cachedBusinessSchedule = schedule;
    cachedBusinessScheduleAt = Date.now();
    return schedule;
  }
};

export const getCachedBusinessSchedule = () =>
  cachedBusinessSchedule || {
    weeklySlots: WEEKLY_BUSINESS_SLOTS,
    maxBookingDaysAhead: MAX_BOOKING_DAYS_AHEAD
  };

export const buildSlotDateFromLocal = (
  dateValue,
  timeValue,
  timeZone = ISRAEL_TIME_ZONE
) => {
  const date = normalizeDateString(dateValue);
  const time = normalizeTimeString(timeValue);
  const [year, month, day] = date.split('-').map(Number);
  const [hours, minutes] = time.split(':').map(Number);
  const utcGuess = new Date(Date.UTC(year, month - 1, day, hours, minutes, 0));
  const zonedParts = getFormatterParts(utcGuess, timeZone);
  const zonedAsUtc = Date.UTC(
    Number(zonedParts.year),
    Number(zonedParts.month) - 1,
    Number(zonedParts.day),
    Number(zonedParts.hour),
    Number(zonedParts.minute),
    Number(zonedParts.second)
  );

  return new Date(utcGuess.getTime() - (zonedAsUtc - utcGuess.getTime()));
};

const WEEKDAY_SHORT_TO_INDEX = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6
};

const getWeekdayIndexForLocalDate = (dateValue, timeZone = ISRAEL_TIME_ZONE) => {
  const normalizedDate = normalizeDateString(dateValue);
  const date = buildSlotDateFromLocal(normalizedDate, '12:00', timeZone);
  const weekdayShort = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short'
  }).format(date);

  return WEEKDAY_SHORT_TO_INDEX[weekdayShort] ?? null;
};

export const getAllowedSlotsForLocalDate = (dateValue, timeZone = ISRAEL_TIME_ZONE, weeklySlots = WEEKLY_BUSINESS_SLOTS) => {
  try {
    const weekdayIndex = getWeekdayIndexForLocalDate(dateValue, timeZone);
    if (weekdayIndex === null) return [];
    return weeklySlots[weekdayIndex] || [];
  } catch {
    return [];
  }
};

export const TIME_SLOTS = getAllTimeSlots(WEEKLY_BUSINESS_SLOTS);

const addDaysToDateString = (dateValue, daysToAdd) => {
  const normalizedDate = normalizeDateString(dateValue);
  const [year, month, day] = normalizedDate.split('-').map(Number);
  const utcDate = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  utcDate.setUTCDate(utcDate.getUTCDate() + daysToAdd);
  const parts = getFormatterParts(utcDate, ISRAEL_TIME_ZONE);
  return `${parts.year}-${parts.month}-${parts.day}`;
};

const toLocalTimeLabel = (value, timeZone = ISRAEL_TIME_ZONE) => {
  const parts = getFormatterParts(new Date(value), timeZone);
  return `${parts.hour}:${parts.minute}`;
};

const toLocalDateLabel = (value, timeZone = ISRAEL_TIME_ZONE) => {
  const parts = getFormatterParts(new Date(value), timeZone);
  return `${parts.year}-${parts.month}-${parts.day}`;
};

export const listAppointmentsForLocalDate = async (
  dateValue,
  timeZone = ISRAEL_TIME_ZONE
) => {
  const supabase = getSupabaseClient();
  const normalizedDate = normalizeDateString(dateValue);
  const nextDate = addDaysToDateString(normalizedDate, 1);
  const start = buildSlotDateFromLocal(normalizedDate, '00:00', timeZone).toISOString();
  const end = buildSlotDateFromLocal(nextDate, '00:00', timeZone).toISOString();

  const { data, error } = await supabase
    .from('appointments')
    .select('id, customer_id, date, service, status, notes, price, cancellation_fee')
    .gte('date', start)
    .lt('date', end)
    .neq('status', 'CANCELLED')
    .order('date', { ascending: true });

  if (error) {
    throw createHttpError(500, `Failed to load appointments for date: ${error.message}`);
  }

  const rows = data || [];
  const customerIds = Array.from(new Set(rows.map((row) => row.customer_id).filter(Boolean)));
  let customerMap = new Map();

  if (customerIds.length > 0) {
    const { data: customersData, error: customersError } = await supabase
      .from('customers')
      .select('id, name, pet_name')
      .in('id', customerIds);

    if (customersError) {
      throw createHttpError(500, `Failed to load appointment customers: ${customersError.message}`);
    }

    customerMap = new Map(
      (customersData || []).map((customerRow) => [
        customerRow.id,
        {
          name: customerRow.name,
          petName: customerRow.pet_name
        }
      ])
    );
  }

  return rows.map((row) => {
    const customer = customerMap.get(row.customer_id) || {};
    return {
      ...mapAppointmentResponse(row),
      localTime: toLocalTimeLabel(row.date, timeZone),
      customerName: customer.name || '',
      petName: customer.petName || ''
    };
  });
};

export const listAppointmentsForIsoRange = async (
  startIso,
  endIso,
  timeZone = ISRAEL_TIME_ZONE
) => {
  const supabase = getSupabaseClient();
  const start = startIso instanceof Date ? startIso.toISOString() : String(startIso || '').trim();
  const end = endIso instanceof Date ? endIso.toISOString() : String(endIso || '').trim();

  if (!start || !end) {
    throw createHttpError(400, 'Missing date range for appointments query');
  }

  const { data, error } = await supabase
    .from('appointments')
    .select('id, date, status')
    .gte('date', start)
    .lt('date', end)
    .neq('status', 'CANCELLED')
    .order('date', { ascending: true });

  if (error) {
    throw createHttpError(500, `Failed to load appointments for range: ${error.message}`);
  }

  return (data || []).map((row) => ({
    id: row.id,
    date: row.date,
    localDate: toLocalDateLabel(row.date, timeZone),
    localTime: toLocalTimeLabel(row.date, timeZone)
  }));
};

const mapCustomerResponse = (row) => ({
  id: row.id,
  name: row.name,
  phone: row.phone,
  petName: row.pet_name,
  petType: row.pet_type,
  lastVisit: row.last_visit,
  visitFrequencyWeeks: row.visit_frequency_weeks,
  lifecycleStatus: row.lifecycle_status,
  defaultPrice: row.default_price == null ? undefined : Number(row.default_price),
  notes: row.notes ?? undefined
});

const mapAppointmentResponse = (row) => ({
  id: row.id,
  customerId: row.customer_id,
  date: row.date,
  service: row.service,
  status: row.status,
  notes: row.notes ?? '',
  price: Number(row.price ?? 0),
  cancellationFee: row.cancellation_fee == null ? undefined : Number(row.cancellation_fee)
});

const addMinutes = (dateValue, minutes) => new Date(new Date(dateValue).getTime() + minutes * 60 * 1000);

const rangesOverlap = (leftStart, leftEnd, rightStart, rightEnd) =>
  new Date(leftStart).getTime() < new Date(rightEnd).getTime() &&
  new Date(leftEnd).getTime() > new Date(rightStart).getTime();

const buildDayBoundsFromSlot = (slotDateIso) => {
  const date = new Date(slotDateIso);
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: ISRAEL_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });

  const parts = formatter
    .formatToParts(date)
    .filter((part) => part.type !== 'literal')
    .reduce((acc, part) => {
      acc[part.type] = part.value;
      return acc;
    }, {});

  const localDate = `${parts.year}-${parts.month}-${parts.day}`;
  const nextDate = addDaysToDateString(localDate, 1);

  return {
    start: buildSlotDateFromLocal(localDate, '00:00').toISOString(),
    end: buildSlotDateFromLocal(nextDate, '00:00').toISOString(),
    localDate
  };
};

const ensureSlotAvailable = async (supabase, slotDateIso) => {
  const targetEndIso = addMinutes(slotDateIso, APPOINTMENT_DURATION_MINUTES).toISOString();
  const bounds = buildDayBoundsFromSlot(slotDateIso);

  const { data, error } = await supabase
    .from('appointments')
    .select('id, date')
    .gte('date', bounds.start)
    .lt('date', bounds.end)
    .neq('status', 'CANCELLED')
    .order('date', { ascending: true });

  if (error) {
    throw createHttpError(500, `Failed to validate slot: ${error.message}`);
  }

  return !(data || []).some((row) =>
    rangesOverlap(row.date, addMinutes(row.date, APPOINTMENT_DURATION_MINUTES), slotDateIso, targetEndIso)
  );
};

const dedupeCustomers = (rows = []) => {
  const seen = new Set();
  return rows.filter((row) => {
    if (!row?.id || seen.has(row.id)) return false;
    seen.add(row.id);
    return true;
  });
};

const searchCustomersByText = async (supabase, column, value) => {
  const normalizedValue = String(value || '').trim();
  if (!normalizedValue) return [];

  const exactResponse = await supabase
    .from('customers')
    .select('*')
    .ilike(column, normalizedValue)
    .limit(10);

  if (exactResponse.error) {
    throw createHttpError(500, `Failed to search customer by ${column}: ${exactResponse.error.message}`);
  }

  if ((exactResponse.data?.length || 0) > 0) {
    return exactResponse.data;
  }

  const partialResponse = await supabase
    .from('customers')
    .select('*')
    .ilike(column, `%${normalizedValue}%`)
    .limit(10);

  if (partialResponse.error) {
    throw createHttpError(500, `Failed to search customer by ${column}: ${partialResponse.error.message}`);
  }

  return partialResponse.data || [];
};

const formatCustomerCandidate = (row) => {
  const name = row?.name || 'לקוח';
  const petName = row?.pet_name ? ` (${row.pet_name})` : '';
  return `${name}${petName}`;
};

const buildLoosePhoneIlikePattern = (value = '') => {
  const digits = normalizeDigits(value);
  if (!digits || digits.length < 7) return '';
  return `%${digits.split('').join('%')}%`;
};

const findCustomerRowByPhone = async (supabase, phone) => {
  const phoneVariants = buildPhoneVariants(phone);
  if (phoneVariants.length === 0) {
    return null;
  }

  const exactResponse = await supabase
    .from('customers')
    .select('*')
    .in('phone', phoneVariants)
    .order('updated_at', { ascending: false })
    .limit(1);

  if (exactResponse.error) {
    throw createHttpError(500, `Failed to find customer by phone: ${exactResponse.error.message}`);
  }

  if ((exactResponse.data?.length || 0) > 0) {
    return exactResponse.data?.[0] || null;
  }

  const loosePatterns = Array.from(new Set(phoneVariants.map(buildLoosePhoneIlikePattern).filter(Boolean)));
  if (loosePatterns.length === 0) return null;

  const looseResponse = await supabase
    .from('customers')
    .select('*')
    .or(loosePatterns.map((pattern) => `phone.ilike.${pattern}`).join(','))
    .order('updated_at', { ascending: false })
    .limit(1);

  if (looseResponse.error) {
    throw createHttpError(500, `Failed to find customer by phone: ${looseResponse.error.message}`);
  }

  return looseResponse.data?.[0] || null;
};

export const findCustomerByPhone = async (phone) => {
  const supabase = getSupabaseClient();
  const customerRow = await findCustomerRowByPhone(supabase, phone);
  return customerRow ? mapCustomerResponse(customerRow) : null;
};

const findExistingCustomer = async (supabase, { existingCustomerId, phone, customerName, petName }) => {
  if (existingCustomerId) {
    const { data, error } = await supabase
      .from('customers')
      .select('*')
      .eq('id', existingCustomerId)
      .maybeSingle();

    if (error) {
      throw createHttpError(500, `Failed to load existing customer: ${error.message}`);
    }

    if (data) return data;
  }

  const customerByPhone = await findCustomerRowByPhone(supabase, phone);
  if (customerByPhone) return customerByPhone;

  const normalizedName = String(customerName || '').trim();
  const normalizedPetName = String(petName || '').trim();
  const candidates = dedupeCustomers([
    ...(normalizedName ? await searchCustomersByText(supabase, 'name', normalizedName) : []),
    ...(normalizedPetName ? await searchCustomersByText(supabase, 'pet_name', normalizedPetName) : [])
  ]);

  if (candidates.length > 1) {
    throw createHttpError(
      409,
      `נמצאו כמה לקוחות דומים: ${candidates.map(formatCustomerCandidate).join(', ')}. תשלח שם כלב או טלפון כדי שאדע בדיוק.`
    );
  }

  if (candidates[0]) {
    return candidates[0];
  }

  return null;
};

const resolveAppointmentStartMinutes = (appointment) => {
  const localTime = appointment?.localTime;
  if (typeof localTime === 'string' && /^\d{2}:\d{2}$/.test(localTime)) {
    const [hours, minutes] = localTime.split(':').map(Number);
    return hours * 60 + minutes;
  }

  const appointmentDate = new Date(appointment.date);
  return appointmentDate.getHours() * 60 + appointmentDate.getMinutes();
};

export const getFreeSlotsForAppointments = (
  appointments = [],
  dateValue = null,
  weeklySlots = WEEKLY_BUSINESS_SLOTS
) => {
  const slots = dateValue
    ? getAllowedSlotsForLocalDate(dateValue, ISRAEL_TIME_ZONE, weeklySlots)
    : getAllTimeSlots(weeklySlots);

  return slots.filter((slot) => {
    const [hours, minutes] = slot.split(':').map(Number);
    const targetStart = hours * 60 + minutes;
    const targetEnd = targetStart + APPOINTMENT_DURATION_MINUTES;

    return !appointments.some((appointment) => {
      const appointmentStart = resolveAppointmentStartMinutes(appointment);
      const appointmentEnd = appointmentStart + APPOINTMENT_DURATION_MINUTES;
      return targetStart < appointmentEnd && targetEnd > appointmentStart;
    });
  });
};

export const suggestAlternativeSlots = async (
  dateValue,
  maxSuggestions = 6,
  weeklySlots = WEEKLY_BUSINESS_SLOTS
) => {
  const suggestions = [];

  for (let dayOffset = 0; dayOffset < 4 && suggestions.length < maxSuggestions; dayOffset += 1) {
    const currentDate = addDaysToDateString(dateValue, dayOffset);
    const appointments = await listAppointmentsForLocalDate(currentDate);
    const freeSlots = getFreeSlotsForAppointments(appointments, currentDate, weeklySlots);

    freeSlots.slice(0, maxSuggestions - suggestions.length).forEach((slot) => {
      suggestions.push({
        date: currentDate,
        time: slot
      });
    });
  }

  return suggestions;
};

const insertCustomerRow = async (supabase, payload) => {
  let { data, error } = await supabase
    .from('customers')
    .insert(payload)
    .select('*')
    .single();

  if (error?.message?.includes('lifecycle_status')) {
    const { lifecycle_status, ...fallbackPayload } = payload;
    const retry = await supabase
      .from('customers')
      .insert(fallbackPayload)
      .select('*')
      .single();
    data = retry.data;
    error = retry.error;
  }

  if (error || !data) {
    throw createHttpError(500, error?.message || 'Failed to create customer');
  }

  return data;
};

const createCustomerRecord = async (
  supabase,
  { customerName, phone, petName, petType, notes, defaultPrice, visitFrequencyWeeks, lifecycleStatus, lastVisit }
) => {
  const safeName = String(customerName || '').trim();
  const safePhone = normalizePhoneForStorage(phone);
  const safePetName = String(petName || '').trim();
  const safePetType = String(petType || '').trim();
  const safeFrequency =
    Number.isFinite(Number(visitFrequencyWeeks)) && Number(visitFrequencyWeeks) > 0
      ? Number(visitFrequencyWeeks)
      : 4;
  const safeLifecycleStatus = String(lifecycleStatus || 'ACTIVE').trim() || 'ACTIVE';
  const safeLastVisit =
    lastVisit instanceof Date
      ? lastVisit
      : typeof lastVisit === 'string' && lastVisit.trim()
        ? new Date(lastVisit)
        : new Date();
  const safeDefaultPrice =
    typeof defaultPrice === 'number' && Number.isFinite(defaultPrice) ? defaultPrice : null;

  if (!safeName) {
    throw createHttpError(400, 'Missing customer name');
  }

  if (!safePhone) {
    throw createHttpError(400, 'Missing phone for new customer');
  }

  if (!safePetName || !safePetType) {
    throw createHttpError(400, 'New customers require petName and petType');
  }

  if (!isValidDate(safeLastVisit)) {
    throw createHttpError(400, 'Invalid lastVisit');
  }

  return insertCustomerRow(supabase, {
    id: crypto.randomUUID(),
    name: safeName,
    phone: safePhone,
    pet_name: safePetName,
    pet_type: safePetType,
    last_visit: safeLastVisit.toISOString(),
    visit_frequency_weeks: safeFrequency,
    lifecycle_status: safeLifecycleStatus,
    default_price: safeDefaultPrice,
    notes: typeof notes === 'string' && notes.trim() ? notes.trim() : null
  });
};

export const createAppointmentRecord = async ({
  phone,
  slotDate,
  existingCustomerId,
  customer,
  customerName,
  service,
  notes,
  price,
  visitFrequencyWeeks,
  allowNewCustomerDefaults = false
}) => {
  const supabase = getSupabaseClient();
  const parsedSlotDate = slotDate instanceof Date ? slotDate : new Date(slotDate);

  if (!isValidDate(parsedSlotDate)) {
    throw createHttpError(400, 'Invalid slotDate');
  }

  if (parsedSlotDate.getTime() < Date.now()) {
    throw createHttpError(400, 'Cannot create appointments in the past');
  }

  const businessSchedule = await loadBusinessSchedule();
  const weeklySlots = businessSchedule?.weeklySlots || WEEKLY_BUSINESS_SLOTS;
  const maxBookingDaysAhead =
    typeof businessSchedule?.maxBookingDaysAhead === 'number'
      ? businessSchedule.maxBookingDaysAhead
      : MAX_BOOKING_DAYS_AHEAD;

  const slotDateIso = parsedSlotDate.toISOString();

  const todayLocalDate = buildDayBoundsFromSlot(new Date().toISOString()).localDate;
  const lastAllowedLocalDate = addDaysToDateString(todayLocalDate, maxBookingDaysAhead);

  const slotLocalDate = buildDayBoundsFromSlot(slotDateIso).localDate;
  if (slotLocalDate > lastAllowedLocalDate) {
    throw createHttpError(400, `אפשר לקבוע תור רק עד ${maxBookingDaysAhead} ימים מראש.`);
  }

  const allowedSlots = getAllowedSlotsForLocalDate(slotLocalDate, ISRAEL_TIME_ZONE, weeklySlots);
  if (allowedSlots.length === 0) {
    throw createHttpError(400, 'ביום שבחרת אנחנו לא עובדים. אנחנו עובדים ראשון עד שישי.');
  }

  const slotLocalTime = toLocalTimeLabel(slotDateIso, ISRAEL_TIME_ZONE);
  if (!allowedSlots.includes(slotLocalTime)) {
    throw createHttpError(
      400,
      `בשביל ${slotLocalDate} אפשר לקבוע רק בשעות: ${allowedSlots.join(', ')}.`
    );
  }

  const slotAvailable = await ensureSlotAvailable(supabase, slotDateIso);
  if (!slotAvailable) {
    const alternatives = await suggestAlternativeSlots(slotLocalDate, 6, weeklySlots);
    const alternativesText =
      alternatives.length > 0
        ? ` אפשרויות קרובות: ${alternatives
            .map((option) => `${option.date} ${option.time}`)
            .join(', ')}.`
        : '';
    throw createHttpError(409, `השעה שביקשת כבר תפוסה.${alternativesText}`);
  }

  let customerRow = await findExistingCustomer(supabase, {
    existingCustomerId,
    phone: phone || customer?.phone,
    customerName: customerName || customer?.name,
    petName: customer?.petName
  });
  let createdCustomer = false;

  if (!customerRow) {
    const hasNewCustomerBasics = Boolean(
      (customerName || customer?.name) && (phone || customer?.phone) && customer?.petName && customer?.petType
    );
    const hasBusinessDefaults = Boolean(
      price !== undefined &&
        price !== null &&
        visitFrequencyWeeks !== undefined &&
        visitFrequencyWeeks !== null
    );
    const canCreateNewCustomer = allowNewCustomerDefaults
      ? hasNewCustomerBasics
      : hasNewCustomerBasics && hasBusinessDefaults;

    if (!canCreateNewCustomer) {
      throw createHttpError(404, 'לא מצאתי לקוח קיים לפי השם, הכלב או הטלפון. אם זה לקוח חדש תשלח את כל הפרטים.');
    }

    customerRow = await createCustomerRecord(supabase, {
      customerName: customerName || customer?.name,
      phone: phone || customer?.phone,
      petName: customer?.petName,
      petType: customer?.petType,
      notes,
      defaultPrice: price,
      visitFrequencyWeeks
    });
    createdCustomer = true;
  } else if (customerRow.lifecycle_status === 'ON_HOLD') {
    const { data, error } = await supabase
      .from('customers')
      .update({ lifecycle_status: 'ACTIVE' })
      .eq('id', customerRow.id)
      .select('*')
      .single();

    if (error || !data) {
      throw createHttpError(500, error?.message || 'Failed to reactivate customer');
    }

    customerRow = data;
  }

  const slotStillAvailable = await ensureSlotAvailable(supabase, slotDateIso);
  if (!slotStillAvailable) {
    const alternatives = await suggestAlternativeSlots(slotLocalDate, 6, weeklySlots);
    const alternativesText =
      alternatives.length > 0
        ? ` אפשרויות קרובות: ${alternatives
            .map((option) => `${option.date} ${option.time}`)
            .join(', ')}.`
        : '';
    throw createHttpError(409, `השעה שביקשת כבר תפוסה.${alternativesText}`);
  }

  const normalizedPrice =
    typeof price === 'number' && Number.isFinite(price)
      ? price
      : Number(customerRow.default_price ?? 0);

  const { data: appointmentRow, error: appointmentError } = await supabase
    .from('appointments')
    .insert({
      id: crypto.randomUUID(),
      customer_id: customerRow.id,
      date: slotDateIso,
      service: String(service || DEFAULT_SERVICE).trim() || DEFAULT_SERVICE,
      status: 'SCHEDULED',
      notes: typeof notes === 'string' ? notes : '',
      price: normalizedPrice
    })
    .select('*')
    .single();

  if (appointmentError || !appointmentRow) {
    throw createHttpError(500, appointmentError?.message || 'Failed to create appointment');
  }

  // Schedule a "day before" reminder for customers.
  try {
    const reminderPhone = toWhatsAppNumber(phone || customerRow.phone || customer?.phone || '');
    if (reminderPhone) {
      const remindLocalDate = addDaysToDateString(slotLocalDate, -1);
      const computedRemindAt = buildSlotDateFromLocal(remindLocalDate, reminderDayBeforeTime);
      const now = Date.now();
      const remindAt =
        computedRemindAt instanceof Date && computedRemindAt.getTime() > now
          ? computedRemindAt
          : new Date(now + 60 * 1000);

      await createReminder({
        sourceKind: 'APPOINTMENT',
        sourceId: appointmentRow.id,
        phone: reminderPhone,
        title: (customerRow?.name || customerName || customer?.name || 'תור').toString().trim() || 'תור',
        remindAt,
        payload: {
          reminderKind: 'DAY_BEFORE',
          customerName: customerRow?.name || customerName || customer?.name || '',
          petName: customerRow?.pet_name || customer?.petName || '',
          date: slotLocalDate,
          time: slotLocalTime
        }
      });
    }
  } catch {
    // Reminder scheduling is best-effort; appointment creation should still succeed.
  }

  return {
    createdCustomer,
    customer: mapCustomerResponse(customerRow),
    appointment: mapAppointmentResponse(appointmentRow)
  };
};

export const createAppointmentFromStructuredInput = async ({
  existingCustomerId,
  customerName,
  phone,
  date,
  time,
  service,
  notes,
  petName,
  petType,
  price,
  visitFrequencyWeeks,
  allowNewCustomerDefaults
}) => {
  if (!customerName && !existingCustomerId && !phone && !petName) {
    throw createHttpError(400, 'Missing customer identifier');
  }

  if (!date || !time) {
    throw createHttpError(400, 'Missing required fields: date, time');
  }

  return createAppointmentRecord({
    existingCustomerId,
    phone,
    customerName,
    slotDate: buildSlotDateFromLocal(date, time),
    customer: {
      name: customerName,
      phone,
      petName,
      petType
    },
    service: service || DEFAULT_SERVICE,
    notes,
    price,
    visitFrequencyWeeks,
    allowNewCustomerDefaults
  });
};

export const createCustomerFromStructuredInput = async ({
  customerName,
  phone,
  petName,
  petType,
  notes,
  defaultPrice,
  visitFrequencyWeeks,
  lifecycleStatus,
  lastVisit
}) => {
  if (!customerName) {
    throw createHttpError(400, 'Missing customer name');
  }

  if (!phone) {
    throw createHttpError(400, 'Missing phone for new customer');
  }

  if (!petName || !petType) {
    throw createHttpError(400, 'New customers require petName and petType');
  }

  const supabase = getSupabaseClient();
  const existingCustomer = await findExistingCustomer(supabase, {
    phone,
    customerName
  });

  if (existingCustomer) {
    const normalizedInputPhone = normalizePhoneForStorage(phone);
    const normalizedExistingPhone = normalizePhoneForStorage(existingCustomer.phone);

    if (normalizedInputPhone && normalizedInputPhone === normalizedExistingPhone) {
      throw createHttpError(409, 'כבר קיים לקוח עם הטלפון הזה.');
    }

    throw createHttpError(409, `כבר קיים לקוח בשם ${existingCustomer.name}.`);
  }

  const createdCustomer = await createCustomerRecord(supabase, {
    customerName,
    phone,
    petName,
    petType,
    notes,
    defaultPrice,
    visitFrequencyWeeks,
    lifecycleStatus,
    lastVisit
  });

  return {
    customer: mapCustomerResponse(createdCustomer)
  };
};

export const toApiError = (error) => ({
  statusCode: Number(error?.statusCode) || 500,
  message: error?.message || 'Server error'
});
