import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

const ISRAEL_TIME_ZONE = 'Asia/Jerusalem';
const DEFAULT_SERVICE = 'תור לקוח';

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseServiceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

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

export const generateTimeSlots = () => {
  const slots = [];
  for (let hour = 7; hour <= 20; hour += 1) {
    slots.push(`${String(hour).padStart(2, '0')}:00`);
    if (hour !== 20) {
      slots.push(`${String(hour).padStart(2, '0')}:30`);
    }
  }
  return slots;
};

export const TIME_SLOTS = generateTimeSlots();

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

  return (data || []).map((row) => ({
    ...mapAppointmentResponse(row),
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

const ensureSlotAvailable = async (supabase, slotDateIso) => {
  const { data, error } = await supabase
    .from('appointments')
    .select('id')
    .eq('date', slotDateIso)
    .neq('status', 'CANCELLED')
    .limit(1);

  if (error) {
    throw createHttpError(500, `Failed to validate slot: ${error.message}`);
  }

  return (data?.length ?? 0) === 0;
};

const findExistingCustomer = async (supabase, { existingCustomerId, phone, customerName }) => {
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

  const phoneVariants = buildPhoneVariants(phone);
  if (phoneVariants.length > 0) {
    const { data, error } = await supabase
      .from('customers')
      .select('*')
      .in('phone', phoneVariants)
      .limit(1);

    if (error) {
      throw createHttpError(500, `Failed to find customer by phone: ${error.message}`);
    }

    if (data?.[0]) return data[0];
  }

  const normalizedName = String(customerName || '').trim();
  if (normalizedName) {
    const { data, error } = await supabase
      .from('customers')
      .select('*')
      .eq('name', normalizedName)
      .limit(2);

    if (error) {
      throw createHttpError(500, `Failed to find customer by name: ${error.message}`);
    }

    if ((data?.length ?? 0) > 1) {
      throw createHttpError(409, 'נמצאו כמה לקוחות בשם הזה. צריך מספר טלפון או מזהה מדויק.');
    }

    if (data?.[0]) return data[0];
  }

  return null;
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
  price
}) => {
  const supabase = getSupabaseClient();
  const parsedSlotDate = slotDate instanceof Date ? slotDate : new Date(slotDate);

  if (!isValidDate(parsedSlotDate)) {
    throw createHttpError(400, 'Invalid slotDate');
  }

  if (parsedSlotDate.getTime() < Date.now()) {
    throw createHttpError(400, 'Cannot create appointments in the past');
  }

  const slotDateIso = parsedSlotDate.toISOString();
  const slotAvailable = await ensureSlotAvailable(supabase, slotDateIso);
  if (!slotAvailable) {
    throw createHttpError(409, 'השעה כבר נתפסה. בחר שעה אחרת.');
  }

  let customerRow = await findExistingCustomer(supabase, {
    existingCustomerId,
    phone: phone || customer?.phone,
    customerName: customerName || customer?.name
  });
  let createdCustomer = false;

  if (!customerRow) {
    customerRow = await createCustomerRecord(supabase, {
      customerName: customerName || customer?.name,
      phone: phone || customer?.phone,
      petName: customer?.petName,
      petType: customer?.petType,
      notes
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
    throw createHttpError(409, 'השעה כבר נתפסה. בחר שעה אחרת.');
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
  price
}) => {
  if (!customerName && !existingCustomerId && !phone) {
    throw createHttpError(400, 'Missing customerName or phone');
  }

  if (!date || !time || !service) {
    throw createHttpError(400, 'Missing required fields: date, time, service');
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
    service,
    notes,
    price
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
