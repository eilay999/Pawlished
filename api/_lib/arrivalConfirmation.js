import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const normalizeDigits = (value = '') => String(value || '').replace(/\D/g, '');

// Customers reply with "1" / "מאשר" etc. to the day-before reminder.
export const isArrivalConfirmationText = (text = '') =>
  /^\s*(?:1|כן|מאשר(?:ת)?|מאושר|אישור|מגיע(?:ה)?|נגיע|בסדר|אוקיי|אוקי|ok)[\s.!]*$/iu.test(String(text));

// Marks the customer's next SCHEDULED appointment as confirmed, only when a
// DAY_BEFORE reminder was actually sent to them (so a stray "1" isn't misread).
// Returns the confirmed appointment row, or null.
export const confirmArrivalByPhone = async (phone) => {
  if (!supabaseUrl || !supabaseServiceKey) return null;
  const digits = normalizeDigits(phone);
  if (!digits) return null;
  const local = digits.startsWith('972') ? `0${digits.slice(3)}` : digits;

  const supabase = createClient(supabaseUrl, supabaseServiceKey, { auth: { persistSession: false } });

  const since = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  const { data: reminders } = await supabase
    .from('whatsapp_reminders')
    .select('source_id')
    .eq('source_kind', 'APPOINTMENT')
    .in('phone', [digits, local])
    .contains('payload', { reminderKind: 'DAY_BEFORE' })
    .gte('sent_at', since)
    .order('sent_at', { ascending: false })
    .limit(1);

  const appointmentId = reminders?.[0]?.source_id;
  if (!appointmentId) return null;

  const { data, error } = await supabase
    .from('appointments')
    .update({ arrival_confirmed_at: new Date().toISOString() })
    .eq('id', appointmentId)
    .eq('status', 'SCHEDULED')
    .select('id, date')
    .maybeSingle();

  return error ? null : data || null;
};
