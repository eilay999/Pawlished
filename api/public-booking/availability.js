import {
  buildSlotDateFromLocal,
  getAllowedSlotsForLocalDate,
  getFreeSlotsForAppointments,
  listAppointmentsForLocalDate
} from '../_lib/appointments.js';

const toDateKey = (date) =>
  `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(
    date.getUTCDate()
  ).padStart(2, '0')}`;

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.status(405).json({ ok: false, error: 'Method not allowed' });
    return;
  }

  try {
    const today = new Date();
    const days = [];

    for (let offset = 0; offset < 14; offset += 1) {
      const date = new Date(Date.UTC(
        today.getUTCFullYear(),
        today.getUTCMonth(),
        today.getUTCDate() + offset,
        12
      ));
      const dateKey = toDateKey(date);
      const allowedSlots = getAllowedSlotsForLocalDate(dateKey);
      if (allowedSlots.length === 0) continue;

      const appointments = await listAppointmentsForLocalDate(dateKey);
      const slots = getFreeSlotsForAppointments(appointments, dateKey).filter((time) => {
        const slot = buildSlotDateFromLocal(dateKey, time);
        return slot.getTime() > Date.now();
      });
      days.push({ date: dateKey, slots });
    }

    res.setHeader('Cache-Control', 'private, max-age=0, no-store');
    res.status(200).json({ ok: true, days });
  } catch {
    res.status(500).json({ ok: false, error: 'Availability is temporarily unavailable' });
  }
}
