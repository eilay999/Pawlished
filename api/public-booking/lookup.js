import { findCustomerByPhone } from '../_lib/appointments.js';
import { requireBookingToken } from '../_lib/bookingAuth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ ok: false, error: 'Method not allowed' });
    return;
  }

  try {
    const { phone } = req.body || {};
    requireBookingToken(req, phone);
    const customer = await findCustomerByPhone(phone);

    res.setHeader('Cache-Control', 'private, max-age=0, no-store');
    res.status(200).json({
      ok: true,
      customer: customer
        ? {
            id: customer.id,
            name: customer.name,
            petName: customer.petName,
            petType: customer.petType
          }
        : null
    });
  } catch (error) {
    const statusCode = Number(error?.statusCode || 500);
    res.status(statusCode).json({
      ok: false,
      error: statusCode === 401 ? 'Phone verification required' : 'Lookup failed'
    });
  }
}
