import { createCustomerFromStructuredInput, toApiError } from '../_lib/appointments.js';
import { requireOtpSession } from '../_lib/otpSession.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ ok: false, error: 'Method not allowed' });
    return;
  }

  try {
    const otpSession = requireOtpSession(req);
    const { customer } = req.body || {};

    const result = await createCustomerFromStructuredInput({
      customerName: customer?.name,
      phone: otpSession.phone,
      petName: customer?.petName,
      petType: customer?.petType
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
