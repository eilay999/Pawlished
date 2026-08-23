import {
  buildSlotDateFromLocal,
  getAllowedSlotsForLocalDate,
  getFreeSlotsForAppointments,
  loadBusinessSchedule,
  listAppointmentsForIsoRange,
  toApiError
} from '../_lib/appointments.js';

const ISRAEL_TIME_ZONE = 'Asia/Jerusalem';

const formatIsraelDate = (date = new Date()) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: ISRAEL_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date);

const addDaysToIsraelDateString = (dateValue, offsetDays) => {
  const [year, month, day] = String(dateValue || '')
    .trim()
    .split('-')
    .map(Number);

  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return null;
  }

  const utcMidday = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  utcMidday.setUTCDate(utcMidday.getUTCDate() + Number(offsetDays || 0));
  return formatIsraelDate(utcMidday);
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

const getWeekdayIndexForIsraelDate = (dateValue) => {
  try {
    const date = buildSlotDateFromLocal(dateValue, '12:00', ISRAEL_TIME_ZONE);
    const weekdayShort = new Intl.DateTimeFormat('en-US', {
      timeZone: ISRAEL_TIME_ZONE,
      weekday: 'short'
    }).format(date);
    return WEEKDAY_SHORT_TO_INDEX[weekdayShort] ?? null;
  } catch {
    return null;
  }
};

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.status(405).json({ ok: false, error: 'Method not allowed' });
    return;
  }

  try {
    const businessSchedule = await loadBusinessSchedule();
    const weeklySlots = businessSchedule?.weeklySlots;
    const maxBookingDaysAhead =
      typeof businessSchedule?.maxBookingDaysAhead === 'number'
        ? businessSchedule.maxBookingDaysAhead
        : 30;

    const daysParam = typeof req.query?.days === 'string' ? req.query.days : '';
    const requestedDays = Number(daysParam || 14);
    const daysToFetch = Math.min(
      maxBookingDaysAhead,
      Math.max(1, Number.isFinite(requestedDays) ? requestedDays : 14)
    );

    const today = formatIsraelDate(new Date());
    const endDateExclusive = addDaysToIsraelDateString(today, daysToFetch);

    const appointmentsByDate = new Map();
    if (endDateExclusive) {
      const startIso = buildSlotDateFromLocal(today, '00:00', ISRAEL_TIME_ZONE).toISOString();
      const endIso = buildSlotDateFromLocal(endDateExclusive, '00:00', ISRAEL_TIME_ZONE).toISOString();

      const rangeAppointments = await listAppointmentsForIsoRange(startIso, endIso, ISRAEL_TIME_ZONE);
      rangeAppointments.forEach((appt) => {
        if (!appt?.localDate) return;
        const list = appointmentsByDate.get(appt.localDate) || [];
        list.push(appt);
        appointmentsByDate.set(appt.localDate, list);
      });
    }
    const days = [];

    for (let offset = 0; offset < daysToFetch; offset += 1) {
      const date = addDaysToIsraelDateString(today, offset);
      if (!date) continue;

      const allowedSlots = getAllowedSlotsForLocalDate(date, ISRAEL_TIME_ZONE, weeklySlots);
      const weekdayIndex = getWeekdayIndexForIsraelDate(date);
      const shouldInclude = allowedSlots.length > 0;

      if (!shouldInclude) {
        continue;
      }

      const appointments = appointmentsByDate.get(date) || [];
      const freeSlots = getFreeSlotsForAppointments(appointments, date, weeklySlots);

      days.push({
        date,
        weekdayIndex,
        times: allowedSlots.map((time) => ({
          time,
          available: freeSlots.includes(time)
        }))
      });
    }

    res.status(200).json({ ok: true, days });
  } catch (error) {
    const apiError = toApiError(error);
    res.status(apiError.statusCode).json({ ok: false, error: apiError.message });
  }
}
