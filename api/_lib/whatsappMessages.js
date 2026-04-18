import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { normalizeDigits } from './appointments.js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseServiceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

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

const isMissingTableError = (error) => {
  const message = String(error?.message || '');
  return error?.code === '42P01' || message.includes('whatsapp_messages');
};

const safeMetadata = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return value;
};

export const logWhatsAppMessage = async ({
  phone,
  direction,
  body,
  messageType = 'text',
  intentKind = null,
  needsHuman = false,
  metadata = {}
}) => {
  const phoneKey = normalizeDigits(phone);
  const text = String(body || '').trim();
  const safeDirection = String(direction || '').toUpperCase();

  if (!phoneKey || !text || !['INCOMING', 'OUTGOING', 'SYSTEM'].includes(safeDirection)) {
    return null;
  }

  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('whatsapp_messages')
    .insert({
      id: crypto.randomUUID(),
      phone: phoneKey,
      direction: safeDirection,
      body: text,
      message_type: String(messageType || 'text'),
      intent_kind: intentKind ? String(intentKind) : null,
      needs_human: Boolean(needsHuman),
      metadata: safeMetadata(metadata)
    })
    .select('*')
    .single();

  if (error) {
    if (isMissingTableError(error)) {
      return null;
    }
    throw createHttpError(500, `Failed to log WhatsApp message: ${error.message}`);
  }

  return data || null;
};
