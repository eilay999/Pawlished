import { createAppointmentRecord, toApiError } from '../_lib/appointments.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ ok: false, error: 'Method not allowed' });
    return;
  }

  try {
    const {
      phone,
      slotDate,
      existingCustomerId,
      customer,
      service,
      notes,
      price
    } = req.body || {};

    const result = await createAppointmentRecord({
      phone,
      slotDate,
      existingCustomerId,
      customer,
      customerName: customer?.name,
      service,
      notes,
      price
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
