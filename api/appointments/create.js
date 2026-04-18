import {
  createAppointmentFromStructuredInput,
  toApiError
} from '../_lib/appointments.js';

const apiSecret = process.env.APPOINTMENTS_API_SECRET;

const getProvidedSecret = (req) =>
  req.headers['x-appointments-secret'] ||
  req.headers['x-api-secret'] ||
  req.body?.secret ||
  '';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ success: false, message: 'Method not allowed' });
    return;
  }

  if (!apiSecret) {
    res.status(500).json({
      success: false,
      message: 'APPOINTMENTS_API_SECRET is not configured'
    });
    return;
  }

  const providedSecret = String(getProvidedSecret(req));
  if (!providedSecret || providedSecret !== apiSecret) {
    res.status(401).json({ success: false, message: 'Unauthorized' });
    return;
  }

  try {
    const {
      existingCustomerId,
      customerName,
      phone,
      date,
      time,
      service,
      notes,
      petName,
      petType,
      price,
      visitFrequencyWeeks,
      allowNewCustomerDefaults
    } = req.body || {};

    const result = await createAppointmentFromStructuredInput({
      existingCustomerId,
      customerName,
      phone,
      date,
      time,
      service,
      notes,
      petName,
      petType,
      price,
      visitFrequencyWeeks,
      allowNewCustomerDefaults
    });

    res.status(200).json({
      success: true,
      message: 'Appointment created',
      ...result
    });
  } catch (error) {
    const apiError = toApiError(error);
    res.status(apiError.statusCode).json({
      success: false,
      message: apiError.message
    });
  }
}
