import './dryRun.js';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { safeEqual } from './safeCompare.js';

// Grow (formerly Meshulam) "Light API" integration for deposit payment links.
//
// IMPORTANT: written from Grow's public docs summary, NOT yet validated against a real Grow
// account/sandbox (docs were not reachable when this was written). Before enabling in
// production, test in the sandbox (GROW_BASE_URL=https://sandbox.meshulam.co.il) and check the
// request encoding, response shape (`data.url`) and callback payload in `parseGrowCallback`.
//
// Inactive unless GROW_USER_ID, GROW_PAGE_CODE, GROW_NOTIFY_SECRET and PUBLIC_BASE_URL are set.

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const growBaseUrl = (process.env.GROW_BASE_URL || 'https://secure.meshulam.co.il').replace(/\/+$/, '');
const growUserId = (process.env.GROW_USER_ID || '').trim();
const growPageCode = (process.env.GROW_PAGE_CODE || '').trim();
const notifySecret = (process.env.GROW_NOTIFY_SECRET || '').trim();
const publicBaseUrl = (process.env.PUBLIC_BASE_URL || '').trim().replace(/\/+$/, '');

export const depositAmount = () => {
  const value = Number(process.env.DEPOSIT_AMOUNT || 50);
  return Number.isFinite(value) && value > 0 ? value : 50;
};

// How long an unpaid online booking keeps its slot before it is released.
export const paymentHoldMinutes = () => {
  const value = Number(process.env.PAYMENT_HOLD_MINUTES || 30);
  return Number.isFinite(value) && value >= 1 ? value : 30;
};

export const isGrowConfigured = () =>
  Boolean(growUserId && growPageCode && notifySecret && publicBaseUrl.startsWith('https://'));

// The notify URL carries (appointment, kind, HMAC) so the webhook never trusts ids from the body.
export const signNotifyToken = (appointmentId, kind) =>
  crypto.createHmac('sha256', notifySecret).update(`grow:${appointmentId}:${kind}`).digest('hex');

export const verifyNotifyToken = (appointmentId, kind, token) =>
  Boolean(notifySecret && appointmentId && kind && safeEqual(String(token || ''), signNotifyToken(appointmentId, kind)));

const getSupabaseClient = () => {
  if (!supabaseUrl || !supabaseServiceKey) throw new Error('Supabase service role not configured');
  return createClient(supabaseUrl, supabaseServiceKey, { auth: { persistSession: false } });
};

const toLocalPhone = (value = '') => {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.startsWith('972')) return `0${digits.slice(3)}`;
  return digits;
};

// Grow requires a full name with at least two words.
const toFullName = (name = '') => {
  const clean = String(name || '').replace(/[^\p{L}\s'-]/gu, ' ').replace(/\s+/g, ' ').trim();
  if (!clean) return 'לקוח Pawlished';
  return clean.includes(' ') ? clean : `${clean} -`;
};

export const createGrowPaymentLink = async ({ appointmentId, kind = 'DEPOSIT', sum, description, fullName, phone }) => {
  if (!isGrowConfigured()) throw new Error('Grow is not configured');

  const notifyUrl =
    `${publicBaseUrl}/api/whatsapp-webhook?source=grow&a=${encodeURIComponent(appointmentId)}` +
    `&k=${encodeURIComponent(kind)}&t=${signNotifyToken(appointmentId, kind)}`;

  const form = new FormData();
  form.append('pageCode', growPageCode);
  form.append('userId', growUserId);
  form.append('sum', String(sum));
  form.append('description', String(description || 'דמי קביעת תור').replace(/[^\p{L}\p{N}\s]/gu, ' ').trim());
  form.append('successUrl', `${publicBaseUrl}/booking/?paid=1`);
  form.append('cancelUrl', `${publicBaseUrl}/booking/`);
  form.append('notifyUrl', notifyUrl);
  form.append('pageField[fullName]', toFullName(fullName));
  form.append('pageField[phone]', toLocalPhone(phone));
  form.append('cField1', String(appointmentId));
  form.append('cField2', String(kind));

  const response = await fetch(`${growBaseUrl}/api/light/server/1.0/createPaymentProcess`, {
    method: 'POST',
    body: form
  });
  const text = await response.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    // handled below
  }
  const url = data?.data?.url || data?.url;
  if (!response.ok || !url) {
    throw new Error(`Grow createPaymentProcess failed (${response.status})`);
  }
  return String(url);
};

export const approveGrowTransaction = async (transactionId) => {
  const form = new FormData();
  form.append('pageCode', growPageCode);
  form.append('transactionId', String(transactionId));
  const response = await fetch(`${growBaseUrl}/api/light/server/1.0/approveTransaction`, {
    method: 'POST',
    body: form
  });
  if (!response.ok) throw new Error(`Grow approveTransaction failed (${response.status})`);
};

// Tolerant parsing: the callback may be flat or nested under `data`.
export const parseGrowCallback = (body = {}) => {
  const source = body && typeof body === 'object' && body.data && typeof body.data === 'object' ? body.data : body || {};
  const sum = Number(String(source.paymentSum ?? source.sum ?? '').replace(/[^\d.]/g, ''));
  return {
    transactionId: String(source.transactionId ?? source.transactionCode ?? '').trim(),
    paymentSum: Number.isFinite(sum) ? sum : 0
  };
};

// Creates (or reuses none) a deposit payment link for an appointment whose deposit is unpaid.
// Returns the URL, or null when not applicable (Grow off, deposit already paid, appointment gone).
export const getDepositLinkForAppointment = async (appointmentId) => {
  if (!isGrowConfigured() || !appointmentId) return null;

  const supabase = getSupabaseClient();
  const { data: appointment } = await supabase
    .from('appointments')
    .select('id, customer_id, status, deposit_paid_at, deposit_requested_at')
    .eq('id', appointmentId)
    .maybeSingle();
  if (!appointment || appointment.deposit_paid_at) return null;

  const isHeld = appointment.status === 'PENDING_PAYMENT';
  if (!isHeld && appointment.status !== 'SCHEDULED') return null;
  if (isHeld) {
    // A hold is only payable while it is alive; the slot may already belong to someone else.
    const holdEndsAt = new Date(appointment.deposit_requested_at || 0).getTime() + paymentHoldMinutes() * 60 * 1000;
    if (!(holdEndsAt > Date.now())) return null;
  }

  const { data: customer } = await supabase
    .from('customers')
    .select('name, phone')
    .eq('id', appointment.customer_id)
    .maybeSingle();

  const sum = depositAmount();
  const url = await createGrowPaymentLink({
    appointmentId,
    kind: 'DEPOSIT',
    sum,
    description: 'דמי קביעת תור Pawlished',
    fullName: customer?.name,
    phone: customer?.phone
  });

  // For a held appointment deposit_requested_at is the start of the hold: never move it, or a
  // customer could keep a slot forever by asking for new links.
  await supabase
    .from('appointments')
    .update(isHeld ? { deposit_amount: sum } : { deposit_amount: sum, deposit_requested_at: new Date().toISOString() })
    .eq('id', appointmentId);

  return url;
};
