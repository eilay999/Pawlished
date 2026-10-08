import { getCustomerProfileByPhone, toApiError } from '../_lib/appointments.js';
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
    const profile = await getCustomerProfileByPhone(otpSession.phone);
    res.status(200).json({
      ok: true,
      exists: Boolean(profile),
      customer: profile?.customer ?? null,
      dogs: profile?.dogs ?? [],
      upcomingAppointments: profile?.upcomingAppointments ?? []
    });
  } catch (error) {
    const apiError = toApiError(error);
    res.status(apiError.statusCode).json({ ok: false, error: apiError.message });
  }
}
