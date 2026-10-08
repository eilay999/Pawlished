import {
  addDogForPhone,
  createCustomerFromStructuredInput,
  toApiError,
  updateDogForPhone
} from '../_lib/appointments.js';
import { requireOtpSession } from '../_lib/otpSession.js';
import {
  publicCustomerView,
  publicDogView,
  sanitizeDogId,
  sanitizePublicCustomer,
  sanitizePublicDog
} from '../_lib/publicBookingInput.js';

// One endpoint for customer-card writes (Vercel Hobby caps a deployment at 12 functions):
//   no action     -> create the customer card (+ first dog)
//   'add-dog'     -> add a dog to the verified phone's card
//   'update-dog'  -> edit one of that card's dogs
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ ok: false, error: 'Method not allowed' });
    return;
  }

  try {
    const otpSession = requireOtpSession(req);
    const action = req.body?.action;

    if (action === 'add-dog') {
      const created = await addDogForPhone(otpSession.phone, sanitizePublicDog(req.body?.dog));
      res.status(200).json({ ok: true, dog: created });
      return;
    }

    if (action === 'update-dog') {
      const dogId = sanitizeDogId(req.body?.dogId);
      if (!dogId) {
        res.status(400).json({ ok: false, error: 'חסר מזהה כלב תקין.' });
        return;
      }
      const updated = await updateDogForPhone(otpSession.phone, dogId, sanitizePublicDog(req.body?.dog));
      res.status(200).json({ ok: true, dog: updated });
      return;
    }

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
      customer: publicCustomerView(result?.customer),
      dog: publicDogView(result?.dog)
    });
  } catch (error) {
    const apiError = toApiError(error);
    res.status(apiError.statusCode).json({
      ok: false,
      error: apiError.message
    });
  }
}
