import { createCustomerFromStructuredInput, toApiError } from '../_lib/appointments.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ ok: false, error: 'Method not allowed' });
    return;
  }

  try {
    const { phone, customer } = req.body || {};

    const result = await createCustomerFromStructuredInput({
      customerName: customer?.name,
      phone,
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

