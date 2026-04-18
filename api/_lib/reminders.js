import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

const ISRAEL_TIME_ZONE = 'Asia/Jerusalem';
const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseServiceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

const createHttpError = (statusCode, message) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const normalizePhone = (value = '') => String(value || '').replace(/\D/g, '');

const normalizeText = (value = '') =>
  String(value || '')
    .replace(/[“”״]/g, '"')
    .replace(/[‘’׳']/g, "'")
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();

const normalizeSearchText = (value = '') =>
  normalizeText(value)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const formatIsraelDateTime = (value) =>
  new Intl.DateTimeFormat('he-IL', {
    timeZone: ISRAEL_TIME_ZONE,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value));

const getSupabaseClient = () => {
  if (!supabaseUrl || !supabaseServiceKey) {
    throw createHttpError(500, 'Supabase service role not configured');
  }

  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false }
  });
};

export const createReminder = async ({
  sourceKind,
  sourceId,
  phone,
  title,
  remindAt,
  payload = {}
}) => {
  const normalizedPhone = normalizePhone(phone);
  if (!normalizedPhone || !title || !remindAt || !sourceKind) {
    return null;
  }

  const remindDate = new Date(remindAt);
  if (Number.isNaN(remindDate.getTime())) {
    throw createHttpError(400, 'Invalid reminder time');
  }

  const supabase = getSupabaseClient();
  const row = {
    id: crypto.randomUUID(),
    source_kind: sourceKind,
    source_id: sourceId || null,
    phone: normalizedPhone,
    title: String(title).trim(),
    remind_at: remindDate.toISOString(),
    payload
  };

  const { data, error } = await supabase
    .from('whatsapp_reminders')
    .insert(row)
    .select('*')
    .single();

  if (error || !data) {
    throw createHttpError(500, error?.message || 'Failed to create reminder');
  }

  return data;
};

export const listDueReminders = async (limit = 50) => {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('whatsapp_reminders')
    .select('*')
    .is('sent_at', null)
    .is('cancelled_at', null)
    .lte('remind_at', new Date().toISOString())
    .order('remind_at', { ascending: true })
    .limit(limit);

  if (error) {
    throw createHttpError(500, `Failed to load due reminders: ${error.message}`);
  }

  return data || [];
};

export const markReminderSent = async (id) => {
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from('whatsapp_reminders')
    .update({ sent_at: new Date().toISOString() })
    .eq('id', id);

  if (error) {
    throw createHttpError(500, `Failed to mark reminder as sent: ${error.message}`);
  }
};

export const listPendingReminders = async (phone, limit = 10) => {
  const normalizedPhone = normalizePhone(phone);
  if (!normalizedPhone) return [];

  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('whatsapp_reminders')
    .select('*')
    .eq('phone', normalizedPhone)
    .is('sent_at', null)
    .is('cancelled_at', null)
    .order('remind_at', { ascending: true })
    .limit(limit);

  if (error) {
    throw createHttpError(500, `Failed to load pending reminders: ${error.message}`);
  }

  return data || [];
};

export const markReminderCancelled = async (id) => {
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from('whatsapp_reminders')
    .update({ cancelled_at: new Date().toISOString() })
    .eq('id', id);

  if (error) {
    throw createHttpError(500, `Failed to cancel reminder: ${error.message}`);
  }
};

const formatReminderLine = (reminder, index = 0) =>
  `${index + 1}. ${formatIsraelDateTime(reminder.remind_at)} - ${reminder.title}`;

const stripCancelPrefix = (text) =>
  normalizeText(text)
    .replace(/^(?:אפשר\s+)?(?:בטל|תבטל|בטלי|תבול|ביטול|מחק|תמחק|תמחקי)(?:\s+לי)?\s*/u, '')
    .replace(/^(?:את\s+)?(?:התזכורת|תזכורת|התזכורות|תזכורות|השעון|שעון|האזכור|אזכור)\s*/u, '')
    .replace(/^(?:של|על|לגבי|ל)\s+/u, '')
    .trim();

export const parseReminderManagementQuery = (message = '') => {
  const text = normalizeText(message);
  if (!text) return null;

  if (/^(?:איזה|מה|תראה|הראה|רשימת|רשום).*(?:תזכורות|תזכורת|שעונים|אזכורים)|^(?:תזכורות|התזכורות)$/u.test(text)) {
    return {
      kind: 'reminder_management_query',
      action: 'list',
      text
    };
  }

  const hasCancelWord = /(?:בטל|תבטל|בטלי|תבול|ביטול|מחק|תמחק|תמחקי)/u.test(text);
  if (!hasCancelWord) return null;

  const talksAboutReminder =
    /(?:תזכורת|תזכורות|שעון|אזכור|להזכיר)/u.test(text) ||
    /^(?:בטל|תבטל|בטלי|תבול|ביטול|מחק|תמחק|תמחקי)$/u.test(text);

  if (!talksAboutReminder) return null;

  if (/(?:^|\s)(?:כל|הכל|כולן|כולם)(?:\s|$)/u.test(text)) {
    return {
      kind: 'reminder_management_query',
      action: 'cancel_all',
      text
    };
  }

  const indexMatch = text.match(/\b(\d{1,2})\b/);
  if (indexMatch?.[1]) {
    return {
      kind: 'reminder_management_query',
      action: 'cancel_index',
      index: Number(indexMatch[1]),
      text
    };
  }

  const selector = stripCancelPrefix(text);
  return {
    kind: 'reminder_management_query',
    action: selector ? 'cancel_match' : 'cancel_latest',
    selector,
    text
  };
};

export const handleReminderManagementQuery = async ({ phone, query }) => {
  const pending = await listPendingReminders(phone, 20);

  if (query.action === 'list') {
    if (!pending.length) {
      return { text: 'אין כרגע תזכורות פעילות.' };
    }

    return {
      reminders: pending,
      text: `התזכורות הפעילות שלך:\n${pending.map(formatReminderLine).join('\n')}`
    };
  }

  if (!pending.length) {
    return { text: 'אין כרגע תזכורות פעילות לבטל.' };
  }

  let remindersToCancel = [];

  if (query.action === 'cancel_all') {
    remindersToCancel = pending;
  } else if (query.action === 'cancel_index') {
    remindersToCancel = pending[query.index - 1] ? [pending[query.index - 1]] : [];
  } else if (query.action === 'cancel_match') {
    const selector = normalizeSearchText(query.selector);
    remindersToCancel = pending.filter((reminder) =>
      normalizeSearchText(reminder.title).includes(selector)
    );
  } else {
    remindersToCancel = [pending[0]];
  }

  if (!remindersToCancel.length) {
    return {
      text: `לא מצאתי תזכורת מתאימה לביטול. התזכורות הפעילות:\n${pending
        .map(formatReminderLine)
        .join('\n')}`
    };
  }

  await Promise.all(remindersToCancel.map((reminder) => markReminderCancelled(reminder.id)));

  if (remindersToCancel.length === 1) {
    return {
      reminders: remindersToCancel,
      text: `ביטלתי את התזכורת: ${formatReminderLine(remindersToCancel[0], 0).replace(/^1\.\s*/, '')}`
    };
  }

  return {
    reminders: remindersToCancel,
    text: `ביטלתי ${remindersToCancel.length} תזכורות.`
  };
};
