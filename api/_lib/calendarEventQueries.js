import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { buildSlotDateFromLocal } from './appointments.js';
import { createReminder } from './reminders.js';

const ISRAEL_TIME_ZONE = 'Asia/Jerusalem';

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseServiceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

const WEEKDAY_MAP = {
  ראשון: 0,
  'יום ראשון': 0,
  שני: 1,
  'יום שני': 1,
  שלישי: 2,
  'יום שלישי': 2,
  רביעי: 3,
  'יום רביעי': 3,
  חמישי: 4,
  'יום חמישי': 4,
  שישי: 5,
  'יום שישי': 5,
  שבת: 6,
  'יום שבת': 6
};

const EVENT_KEYWORDS = ['אירוע', 'חתונה', 'יום הולדת', 'בר מצווה', 'בת מצווה', 'טיסה', 'חופש'];

const createHttpError = (statusCode, message) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const normalizeText = (value = '') =>
  String(value || '')
    .replace(/[“”״]/g, '"')
    .replace(/[’'׳]/g, "'")
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();

const getSupabaseClient = () => {
  if (!supabaseUrl || !supabaseServiceKey) {
    throw createHttpError(500, 'Supabase service role not configured');
  }

  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false }
  });
};

const getNowPartsInIsrael = () => {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: ISRAEL_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  });

  const parts = formatter
    .formatToParts(new Date())
    .filter((part) => part.type !== 'literal')
    .reduce((acc, part) => {
      acc[part.type] = part.value;
      return acc;
    }, {});

  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute)
  };
};

const dateFromParts = ({ year, month, day }) => new Date(Date.UTC(year, month - 1, day, 12, 0, 0));

const addDays = (date, days) => {
  const next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
};

const formatDate = (date) =>
  `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(
    date.getUTCDate()
  ).padStart(2, '0')}`;

const formatIsraelDateTime = (value) =>
  new Intl.DateTimeFormat('he-IL', {
    timeZone: ISRAEL_TIME_ZONE,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value));

const extractExplicitDate = (text) => {
  const isoMatch = text.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (isoMatch) return isoMatch[1];

  const shortMatch = text.match(/\b(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?\b/);
  if (!shortMatch) return null;

  const [, dayRaw, monthRaw, yearRaw] = shortMatch;
  const currentYear = getNowPartsInIsrael().year;
  const year = yearRaw ? Number(yearRaw.length === 2 ? `20${yearRaw}` : yearRaw) : currentYear;
  return `${String(year).padStart(4, '0')}-${String(Number(monthRaw)).padStart(2, '0')}-${String(
    Number(dayRaw)
  ).padStart(2, '0')}`;
};

const extractRelativeDate = (text) => {
  const now = getNowPartsInIsrael();
  const today = dateFromParts(now);

  if (text.includes('מחרתיים')) {
    return formatDate(addDays(today, 2));
  }

  if (text.includes('מחר')) {
    return formatDate(addDays(today, 1));
  }

  if (text.includes('היום')) {
    return formatDate(today);
  }

  const matchedWeekday = Object.keys(WEEKDAY_MAP).find((label) => text.includes(label));
  if (!matchedWeekday) return null;

  const targetDay = WEEKDAY_MAP[matchedWeekday];
  const todayDay = today.getUTCDay();
  let delta = (targetDay - todayDay + 7) % 7;
  if (delta === 0) delta = 7;
  return formatDate(addDays(today, delta));
};

const extractTime = (text) => {
  const match = text.match(/(?:בשעה|שעה|ב-)\s*(\d{1,2})(?::(\d{2}))?\b/) || text.match(/\b(\d{1,2}):(\d{2})\b/);
  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2] || '00');
  if (hours > 23 || minutes > 59) return null;

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
};

const stripDateAndTimeHints = (text) =>
  normalizeText(text)
    .replace(/\b\d{4}-\d{2}-\d{2}\b/g, ' ')
    .replace(/\b\d{1,2}[./]\d{1,2}(?:[./]\d{2,4})?\b/g, ' ')
    .replace(/(?:^|\s)(?:בעוד|עוד)\s+\d{1,3}\s*(?:דק(?:ה|ות)?|דקות|דקה|ד')(?=$|\s)/gu, ' ')
    .replace(/(?:^|\s)(?:בעוד|עוד)\s+\d{1,2}\s*(?:שעה|שעות|שע')(?=$|\s)/gu, ' ')
    .replace(/(?:^|\s)(?:בעוד|עוד)\s+שעה(?=$|\s)/gu, ' ')
    .replace(/(?:^|\s)(?:היום|מחר|מחרתיים)(?=$|\s)/g, ' ')
    .replace(/(?:^|\s)(?:ביום|יום)\s+(?:ראשון|שני|שלישי|רביעי|חמישי|שישי|שבת)(?=$|\s)/g, ' ')
    .replace(/(?:בשעה|שעה|ב-)\s*\d{1,2}(?::\d{2})?\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const extractEventTitle = (text) =>
  stripDateAndTimeHints(text)
    .replace(/^(?:תוסיף|תוסיפי|תכניס|תכניסי|תרשום|תרשמי)(?: לי)?\s+אירוע\s*/u, '')
    .replace(/^אירוע\s*/u, '')
    .replace(/^יש לי\s*/u, '')
    .trim();

const extractReminderTitle = (text) =>
  stripDateAndTimeHints(text)
    .replace(/^(?:אפשר\s+)?(?:תזכיר(?:י)?|תזכור|תזכרי)(?:\s+לי)?\s*/u, '')
    .replace(/^תזכורת\s*/u, '')
    .replace(/^(?:להזכיר|אזכור|תזכורת)(?:\s+לי)?\s*/u, '')
    .trim();

const buildRelativeReminderAt = (text) => {
  const now = new Date();

  const minutesMatch = text.match(/(?:בעוד|עוד)\s+(\d{1,3})\s*(?:דק(?:ה|ות)?|דקות|דקה|ד')(?=$|\s)/u);
  if (minutesMatch?.[1]) {
    return new Date(now.getTime() + Number(minutesMatch[1]) * 60 * 1000);
  }

  const hoursMatch = text.match(/(?:בעוד|עוד)\s+(\d{1,2})\s*(?:שעה|שעות|שע')(?=$|\s)/u);
  if (hoursMatch?.[1]) {
    return new Date(now.getTime() + Number(hoursMatch[1]) * 60 * 60 * 1000);
  }

  if (/(?:בעוד|עוד)\s+שעה/.test(text)) {
    return new Date(now.getTime() + 60 * 60 * 1000);
  }

  const date = extractExplicitDate(text) || extractRelativeDate(text);
  if (!date) return null;

  if (text.includes('בבוקר')) {
    return buildSlotDateFromLocal(date, '08:00');
  }

  const time = extractTime(text);
  if (!time) return buildSlotDateFromLocal(date, '08:00');

  return buildSlotDateFromLocal(date, time);
};

export const parseCalendarEventQuery = (message = '') => {
  const text = normalizeText(message);
  if (!text || text.includes('תזכיר')) return null;

  const looksLikeEvent =
    EVENT_KEYWORDS.some((keyword) => text.includes(keyword)) || /^יש לי\s+/u.test(text);

  if (!looksLikeEvent) return null;

  const date = extractExplicitDate(text) || extractRelativeDate(text);
  const time = extractTime(text);
  const title = extractEventTitle(text);

  return {
    kind: 'calendar_event_query',
    text,
    title,
    date,
    time
  };
};

export const parseQuickReminderQuery = (message = '', baseQuery = null) => {
  const text = normalizeText(message);
  if (!text || text.includes('משימה')) return null;

  const parsedRemindAt = buildRelativeReminderAt(text);
  const hasReminderKeyword = /(?:תזכיר|תזכורת|תזכור|תזכרי)/u.test(text);
  const hasLooseReminderKeyword = /(?:להזכיר|אזכור|תזכורת)/u.test(text);
  const hasReminderContext = Boolean(baseQuery?.title || baseQuery?.remindAt);
  if (!hasReminderKeyword && !hasLooseReminderKeyword && !hasReminderContext) return null;

  const extractedTitle = extractReminderTitle(text);
  const isTimeOnlyFollowUp = Boolean(parsedRemindAt) && !extractedTitle;
  const title = isTimeOnlyFollowUp
    ? baseQuery?.title || ''
    : extractedTitle || baseQuery?.title || '';
  const remindAt = parsedRemindAt || (baseQuery?.remindAt ? new Date(baseQuery.remindAt) : null);

  return {
    kind: 'quick_reminder_query',
    text,
    title,
    remindAt
  };
};

export const createCalendarEventFromQuery = async ({ title, date, time, phone }) => {
  if (!title) {
    throw createHttpError(400, 'חסר לי שם לאירוע.');
  }

  if (!date) {
    throw createHttpError(400, 'חסר לי יום או תאריך לאירוע.');
  }

  const startsAt = buildSlotDateFromLocal(date, time || '08:00');
  const supabase = getSupabaseClient();
  const row = {
    id: crypto.randomUUID(),
    title: String(title).trim(),
    starts_at: startsAt.toISOString(),
    kind: 'EVENT',
    color_key: 'PERSONAL',
    show_in_calendar: true,
    blocks_time: false,
    notes: null
  };

  const { data, error } = await supabase.from('calendar_events').insert(row).select('*').single();

  if (error || !data) {
    throw createHttpError(500, error?.message || 'Failed to create calendar event');
  }

  await createReminder({
    sourceKind: 'EVENT',
    sourceId: data.id,
    phone,
    title: String(title).trim(),
    remindAt: buildSlotDateFromLocal(date, '08:00'),
    payload: {
      kind: 'EVENT',
      startsAt: row.starts_at
    }
  });

  const timeSuffix = time ? ` בשעה ${time}` : '';
  return {
    event: data,
    text: `רשמתי אירוע: ${title} ל-${date}${timeSuffix}. הוא יופיע ביומן בצבע נפרד.`
  };
};

export const createQuickReminderFromQuery = async ({ title, remindAt, phone }) => {
  if (!title) {
    throw createHttpError(400, 'חסר לי מה להזכיר.');
  }

  if (!remindAt) {
    throw createHttpError(400, 'לא הצלחתי להבין מתי להזכיר.');
  }

  await createReminder({
    sourceKind: 'QUICK_REMINDER',
    sourceId: null,
    phone,
    title: String(title).trim(),
    remindAt,
    payload: {
      kind: 'QUICK_REMINDER'
    }
  });

  return {
    text: `רשמתי. אזכיר לך ב-${formatIsraelDateTime(remindAt)}: ${title}`
  };
};
