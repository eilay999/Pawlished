import { createCustomerFromStructuredInput, toApiError } from '../_lib/appointments.js';
import { requireOtpSession } from '../_lib/otpSession.js';
import { publicCustomerView, sanitizePublicCustomer } from '../_lib/publicBookingInput.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ ok: false, error: 'Method not allowed' });
    return;
  }

  try {
    const otpSession = requireOtpSession(req);
    const customer = sanitizePublicCustomer(req.body?.customer);

    const result = await createCustomerFromStructuredInput({
      customerName: customer.name,
      phone: otpSession.phone,
      petName: customer.petName,
      petType: customer.petType,
      phoneOnly: true
    });

    res.status(200).json({
      ok: true,
      customer: publicCustomerView(result?.customer)
    });
  } catch (error) {
    const apiError = toApiError(error);
    res.status(apiError.statusCode).json({
      ok: false,
      error: apiError.message
    });
  }
}
