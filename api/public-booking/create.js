import {
  buildSlotDateFromLocal,
  createAppointmentRecord,
  toApiError
} from '../_lib/appointments.js';
import { requireBookingToken } from '../_lib/bookingAuth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ ok: false, error: 'Method not allowed' });
    return;
  }

  try {
    const {
      phone,
      date,
      time,
      customer,
      service,
      notes,
      price,
      visitFrequencyWeeks
    } = req.body || {};

    requireBookingToken(req, phone);

    const result = await createAppointmentRecord({
      phone,
      slotDate: buildSlotDateFromLocal(date, time),
      customer,
      customerName: customer?.name,
      service,
      notes,
      price,
      visitFrequencyWeeks,
      allowNewCustomerDefaults: true
    });

    res.status(200).json({
      ok: true,
      ...result
    });
  } catch (error) {
    const apiError = toApiError(error);
    res.status(apiError.statusCode).json({
      ok: false,
      error: apiError.message
    });
  }
}
