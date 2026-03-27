import { TIME_SLOTS, listAppointmentsForLocalDate } from './appointments.js';

const ISRAEL_TIME_ZONE = 'Asia/Jerusalem';

const WEEKDAY_MAP = {
  'ראשון': 0,
  'יום ראשון': 0,
  'שני': 1,
  'יום שני': 1,
  'שלישי': 2,
  'יום שלישי': 2,
  'רביעי': 3,
  'יום רביעי': 3,
  'חמישי': 4,
  'יום חמישי': 4,
  'שישי': 5,
  'יום שישי': 5,
  'שבת': 6,
  'יום שבת': 6
};

const normalizeText = (value = '') =>
  String(value || '')
    .replace(/[“”״]/g, '"')
    .replace(/[’'׳]/g, "'")
    .replace(/[–—־]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();

const getNowPartsInIsrael = () => {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: ISRAEL_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
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
    day: Number(parts.day)
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

const extractExplicitDate = (text) => {
  const isoMatch = text.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (isoMatch) return isoMatch[1];

  const shortMatch = text.match(/\b(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?\b/);
  if (!shortMatch) return null;

  const [, dayRaw, monthRaw, yearRaw] = shortMatch;
  const currentYear = getNowPartsInIsrael().year;
  const year = yearRaw ? Number(yearRaw.length === 2 ? `20${yearRaw}` : yearRaw) : currentYear;
  const month = Number(monthRaw);
  const day = Number(dayRaw);
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
};

const extractRelativeDate = (text) => {
  const today = dateFromParts(getNowPartsInIsrael());

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
  if (delta === 0) {
    delta = 7;
  }

  return formatDate(addDays(today, delta));
};

const includesFreeKeyword = (text) => /(פנוי|פנויה|פנויים|פנויות)/.test(text);
const includesBusyKeyword = (text) => /(תפוס|תפוסה|תפוסים|תפוסות)/.test(text);
const includesScheduleKeyword = (text) =>
  /(לוז|לו"ז|לו״ז|הלו"ז|הלו״ז|יומן|מה יש|מה קורה|מה יש לי|מה יש ב)/.test(text);

const formatDateRange = (startDate, endDate) => {
  const startLabel = formatDateLabel(startDate);
  const endLabel = formatDateLabel(endDate);
  return startDate === endDate ? startLabel : `${startLabel} עד ${endLabel}`;
};

const getWeekWindow = () => {
  const today = dateFromParts(getNowPartsInIsrael());
  const daysUntilSaturday = (6 - today.getUTCDay() + 7) % 7;
  const endDate = formatDate(addDays(today, daysUntilSaturday));
  return {
    startDate: formatDate(today),
    endDate
  };
};

export const parseScheduleQuery = (message) => {
  const text = normalizeText(message);
  const wantsFree = includesFreeKeyword(text);
  const wantsBusy = includesBusyKeyword(text);
  const wantsSchedule = includesScheduleKeyword(text);

  if (!wantsFree && !wantsBusy && !wantsSchedule) {
    return null;
  }

  const requestsWeekWindow = text.includes('השבוע') || text.includes('לשבוע');
  if (requestsWeekWindow) {
    const { startDate, endDate } = getWeekWindow();
    return {
      kind: 'schedule_query',
      period: 'week',
      mode: wantsFree && wantsBusy ? 'both' : wantsFree ? 'free' : wantsBusy ? 'busy' : 'overview',
      startDate,
      endDate,
      text
    };
  }

  const date = extractExplicitDate(text) || extractRelativeDate(text);
  if (!date) {
    if (wantsSchedule && !wantsFree && !wantsBusy) {
      return {
        kind: 'schedule_query',
        period: 'day',
        mode: 'overview',
        missingDate: true,
        text
      };
    }

    return {
      kind: 'schedule_query',
      period: 'day',
      mode: wantsFree && wantsBusy ? 'both' : wantsBusy ? 'busy' : 'free',
      missingDate: true,
      text
    };
  }

  return {
    kind: 'schedule_query',
    period: 'day',
    mode: wantsFree && wantsBusy ? 'both' : wantsBusy ? 'busy' : wantsFree ? 'free' : 'overview',
    date,
    text
  };
};

const slotToMinutes = (slot) => {
  const [hours, minutes] = String(slot || '00:00').split(':').map(Number);
  return hours * 60 + minutes;
};

const compressSlots = (slots) => {
  const ordered = Array.from(new Set(slots)).sort((left, right) => slotToMinutes(left) - slotToMinutes(right));
  if (ordered.length === 0) return [];

  const ranges = [];
  let rangeStart = ordered[0];
  let previous = ordered[0];

  for (let index = 1; index < ordered.length; index += 1) {
    const current = ordered[index];
    const isConsecutive = slotToMinutes(current) - slotToMinutes(previous) === 30;

    if (!isConsecutive) {
      ranges.push(rangeStart === previous ? rangeStart : `${rangeStart}-${previous}`);
      rangeStart = current;
    }

    previous = current;
  }

  ranges.push(rangeStart === previous ? rangeStart : `${rangeStart}-${previous}`);
  return ranges;
};

const formatDateLabel = (dateValue) => {
  const [year, month, day] = dateValue.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  return new Intl.DateTimeFormat('he-IL', {
    timeZone: ISRAEL_TIME_ZONE,
    weekday: 'long',
    day: 'numeric',
    month: 'numeric'
  }).format(date);
};

const formatLine = (label, slots, emptyText) => {
  if (slots.length === 0) {
    return `${label}: ${emptyText}`;
  }

  return `${label}: ${compressSlots(slots).join(', ')}`;
};

const formatAppointmentLabel = (appointment) => {
  const nameLabel = appointment.customerName || appointment.petName || 'לקוח';
  return `${appointment.localTime} ${nameLabel} - ${appointment.service}`;
};

const formatBusyAppointmentsLine = (appointments, emptyText) => {
  if (appointments.length === 0) {
    return emptyText;
  }

  return appointments.map(formatAppointmentLabel).join(', ');
};

const buildDayScheduleReply = async ({ date, mode }) => {
  const appointments = await listAppointmentsForLocalDate(date);
  const occupiedSlots = appointments.map((appointment) => appointment.localTime);
  const freeSlots = TIME_SLOTS.filter((slot) => !occupiedSlots.includes(slot));
  const dateLabel = formatDateLabel(date);

  if (mode === 'overview') {
    return {
      text: `מה יש ב${dateLabel}:\n${formatBusyAppointmentsLine(appointments, 'אין תורים מתוכננים כרגע')}`,
      appointments,
      occupiedSlots,
      freeSlots
    };
  }

  if (mode === 'free') {
    return {
      text: `השעות הפנויות ב${dateLabel}:\n${formatLine('פנויות', freeSlots, 'אין שעות פנויות כרגע')}`,
      appointments,
      occupiedSlots,
      freeSlots
    };
  }

  if (mode === 'busy') {
    return {
      text:
        `השעות התפוסות ב${dateLabel}:\n` +
        `${formatLine('תפוסות', occupiedSlots, 'כרגע אין שעות תפוסות')}\n` +
        `פירוט: ${formatBusyAppointmentsLine(appointments, 'אין תורים מתוכננים כרגע')}`,
      appointments,
      occupiedSlots,
      freeSlots
    };
  }

  return {
    text:
      `הלו״ז ב${dateLabel}:\n` +
      `${formatLine('פנויות', freeSlots, 'אין שעות פנויות כרגע')}\n` +
      `${formatLine('תפוסות', occupiedSlots, 'כרגע אין שעות תפוסות')}`,
    appointments,
    occupiedSlots,
    freeSlots
  };
};

const buildWeekScheduleReply = async ({ startDate, endDate, mode }) => {
  const start = dateFromParts(
    (() => {
      const [year, month, day] = startDate.split('-').map(Number);
      return { year, month, day };
    })()
  );
  const end = dateFromParts(
    (() => {
      const [year, month, day] = endDate.split('-').map(Number);
      return { year, month, day };
    })()
  );

  const dates = [];
  for (let cursor = new Date(start.getTime()); cursor.getTime() <= end.getTime(); cursor = addDays(cursor, 1)) {
    dates.push(formatDate(cursor));
  }

  const dayResults = await Promise.all(
    dates.map(async (date) => ({
      date,
      appointments: await listAppointmentsForLocalDate(date)
    }))
  );

  const periodLabel = formatDateRange(startDate, endDate);

  if (mode === 'overview') {
    const occupiedDays = dayResults.filter((day) => day.appointments.length > 0);
    if (occupiedDays.length === 0) {
      return {
        text: `אין תורים מתוכננים ב${periodLabel}.`,
        days: dayResults
      };
    }

    return {
      text:
        `מה יש ב${periodLabel}:\n` +
        occupiedDays
          .map(
            (day) => `${formatDateLabel(day.date)}: ${formatBusyAppointmentsLine(day.appointments, 'אין תורים')}`
          )
          .join('\n'),
      days: dayResults
    };
  }

  const lines = dayResults.map((day) => {
    const occupiedSlots = day.appointments.map((appointment) => appointment.localTime);
    const freeSlots = TIME_SLOTS.filter((slot) => !occupiedSlots.includes(slot));

    if (mode === 'free') {
      return `${formatDateLabel(day.date)}: ${compressSlots(freeSlots).join(', ') || 'אין שעות פנויות כרגע'}`;
    }

    if (mode === 'busy') {
      return `${formatDateLabel(day.date)}: ${formatBusyAppointmentsLine(day.appointments, 'אין תורים מתוכננים')}`;
    }

    return (
      `${formatDateLabel(day.date)}:\n` +
      `פנויות: ${compressSlots(freeSlots).join(', ') || 'אין שעות פנויות כרגע'}\n` +
      `תפוסות: ${compressSlots(occupiedSlots).join(', ') || 'כרגע אין שעות תפוסות'}`
    );
  });

  return {
    text: `הלו״ז ב${periodLabel}:\n${lines.join('\n')}`,
    days: dayResults
  };
};

export const getScheduleReply = async ({ date, mode }) => {
  return buildDayScheduleReply({ date, mode });
};

export const getScheduleWindowReply = async ({ period = 'day', date, startDate, endDate, mode }) => {
  if (period === 'week') {
    return buildWeekScheduleReply({ startDate, endDate, mode });
  }

  return buildDayScheduleReply({ date, mode });
};
