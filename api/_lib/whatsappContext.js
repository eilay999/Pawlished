import { createClient } from '@supabase/supabase-js';
import { normalizeDigits } from './appointments.js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const CONTEXT_TTL_HOURS = 24;

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

const normalizePhoneKey = (value = '') => normalizeDigits(value);

const isMissingTableError = (error) => {
  const message = String(error?.message || '');
  return error?.code === '42P01' || message.includes('whatsapp_contexts');
};

const isExpiredContext = (updatedAt) => {
  const timestamp = new Date(updatedAt).getTime();
  if (!Number.isFinite(timestamp)) return true;

  const ageMs = Date.now() - timestamp;
  return ageMs > CONTEXT_TTL_HOURS * 60 * 60 * 1000;
};

export const loadWhatsAppContext = async (phone) => {
  const phoneKey = normalizePhoneKey(phone);
  if (!phoneKey) return null;

  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('whatsapp_contexts')
    .select('phone, pending_kind, payload, missing_fields, source_text, updated_at')
    .eq('phone', phoneKey)
    .maybeSingle();

  if (error) {
    if (isMissingTableError(error)) {
      return null;
    }
    throw createHttpError(500, `Failed to load WhatsApp context: ${error.message}`);
  }

  if (!data) {
    return null;
  }

  if (isExpiredContext(data.updated_at)) {
    await clearWhatsAppContext(phoneKey);
    return null;
  }

  return {
    phone: data.phone,
    kind: data.pending_kind,
    payload: data.payload || {},
    missingFields: Array.isArray(data.missing_fields) ? data.missing_fields : [],
    sourceText: data.source_text || ''
  };
};

export const saveWhatsAppContext = async (phone, { kind, payload, missingFields, sourceText }) => {
  const phoneKey = normalizePhoneKey(phone);
  if (!phoneKey || !kind) return false;

  const supabase = getSupabaseClient();
  const { error } = await supabase.from('whatsapp_contexts').upsert(
    {
      phone: phoneKey,
      pending_kind: kind,
      payload: payload || {},
      missing_fields: Array.isArray(missingFields) ? missingFields : [],
      source_text: String(sourceText || '')
    },
    { onConflict: 'phone' }
  );

  if (error) {
    if (isMissingTableError(error)) {
      return false;
    }
    throw createHttpError(500, `Failed to save WhatsApp context: ${error.message}`);
  }

  return true;
};

export const clearWhatsAppContext = async (phone) => {
  const phoneKey = normalizePhoneKey(phone);
  if (!phoneKey) return false;

  const supabase = getSupabaseClient();
  const { error } = await supabase.from('whatsapp_contexts').delete().eq('phone', phoneKey);

  if (error) {
    if (isMissingTableError(error)) {
      return false;
    }
    throw createHttpError(500, `Failed to clear WhatsApp context: ${error.message}`);
  }

  return true;
};
