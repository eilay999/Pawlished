import {
  buildSlotDateFromLocal,
  countUpcomingScheduledForPhone,
  createAppointmentRecord,
  expireStaleHolds,
  getAppointmentForPhone,
  holdExpiryIso,
  releaseHold,
  toApiError
} from '../_lib/appointments.js';
import { depositAmount, getDepositLinkForAppointment, isGrowConfigured, paymentHoldMinutes } from '../_lib/grow.js';
import {
  MAX_UPCOMING_PER_PHONE,
  publicAppointmentView,
  publicCustomerView,
  publicDogView,
  sanitizeDogId,
  sanitizePublicCustomer,
  sanitizePublicDog,
  sanitizePublicNotes
} from '../_lib/publicBookingInput.js';
import { requireOtpSession } from '../_lib/otpSession.js';
import { sendBookingConfirmation, sendPaymentRequest } from '../_lib/bookingConfirmation.js';

const ISRAEL_TIME_ZONE = 'Asia/Jerusalem';

const getFormatterParts = (date, timeZone) => {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  });

  return formatter
    .formatToParts(date)
    .filter((part) => part.type !== 'literal')
    .reduce((acc, part) => {
      acc[part.type] = part.value;
      return acc;
    }, {});
};

const deriveConfirmationDateTime = ({ date, time, slotDate }) => {
  const safeDate = typeof date === 'string' ? date.trim() : '';
  const safeTime = typeof time === 'string' ? time.trim() : '';
  if (safeDate && safeTime) return { date: safeDate, time: safeTime };

  const resolved = slotDate instanceof Date ? slotDate : new Date(slotDate);
  const parts = getFormatterParts(resolved, ISRAEL_TIME_ZONE);
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`
  };
};

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ ok: false, error: 'Method not allowed' });
    return;
  }

  try {
    const otpSession = requireOtpSession(req);

    // "pay-link": the customer comes back to a booking that is still waiting for its deposit.
    if (req.body?.action === 'pay-link') {
      await expireStaleHolds();
      const held = await getAppointmentForPhone(otpSession.phone, req.body?.appointmentId);
      if (!held) {
        res.status(404).json({ ok: false, error: 'לא מצאנו את התור הזה.' });
        return;
      }
      const expiresAt = holdExpiryIso(held.deposit_requested_at);
      if (held.status !== 'PENDING_PAYMENT' || !expiresAt || new Date(expiresAt).getTime() <= Date.now()) {
        res.status(409).json({ ok: false, status: held.status, error: 'ההמתנה לתשלום הסתיימה, והשעה שוחררה. אפשר לקבוע תור מחדש.' });
        return;
      }
      const url = await getDepositLinkForAppointment(held.id).catch(() => null);
      if (!url) {
        res.status(502).json({ ok: false, error: 'לא הצלחנו להכין קישור תשלום כרגע. נסו שוב בעוד רגע.' });
        return;
      }
      res.status(200).json({ ok: true, payment: { url, amount: depositAmount(), expiresAt } });
      return;
    }

    // Price, service and visit frequency are decided by the business, never by the customer.
    const { slotDate, date, time } = req.body || {};
    const customer = sanitizePublicCustomer(req.body?.customer);
    const notes = sanitizePublicNotes(req.body?.notes);
    const dogId = sanitizeDogId(req.body?.dogId);
    const newDog = req.body?.newDog ? sanitizePublicDog(req.body.newDog) : undefined;

    if ((await countUpcomingScheduledForPhone(otpSession.phone)) >= MAX_UPCOMING_PER_PHONE) {
      res.status(429).json({
        ok: false,
        error: 'יש לך כבר כמה תורים עתידיים. כדי לשנות או לבטל אפשר לשלוח הודעה לאגם בוואטסאפ.'
      });
      return;
    }

    const resolvedSlotDate =
      date && time
        ? buildSlotDateFromLocal(date, time)
        : slotDate;

    const result = await createAppointmentRecord({
      phone: otpSession.phone,
      slotDate: resolvedSlotDate,
      existingCustomerId: undefined,
      customer: { ...customer, phone: otpSession.phone },
      customerName: customer.name,
      dogId,
      newDog,
      service: undefined,
      notes,
      price: undefined,
      visitFrequencyWeeks: undefined,
      allowNewCustomerDefaults: true,
      phoneOnly: true,
      // With online payments on, the slot is held (not yet confirmed) until the deposit is paid.
      holdForPayment: isGrowConfigured()
    });

    const confirmationDateTime = deriveConfirmationDateTime({
      date,
      time,
      slotDate: result?.appointment?.date || resolvedSlotDate
    });

    if (result?.hold) {
      let paymentUrl = null;
      try {
        paymentUrl = await getDepositLinkForAppointment(result.appointment.id);
      } catch (error) {
        console.error('[public-booking] payment link failed', error?.message || error);
      }

      if (!paymentUrl) {
        // No way to pay means no hold: give the slot straight back.
        await releaseHold(result.appointment.id);
        res.status(502).json({
          ok: false,
          error: 'לא הצלחנו להכין קישור תשלום כרגע, והשעה לא נשמרה. נסו שוב בעוד רגע.'
        });
        return;
      }

      await sendPaymentRequest({
        phone: otpSession.phone,
        date: confirmationDateTime.date,
        time: confirmationDateTime.time,
        url: paymentUrl,
        amount: depositAmount(),
        holdMinutes: paymentHoldMinutes(),
        customerName: result?.customer?.name
      }).catch(() => undefined);

      res.status(200).json({
        ok: true,
        createdCustomer: result?.createdCustomer,
        customer: publicCustomerView(result?.customer),
        dog: publicDogView(result?.dog),
        appointment: publicAppointmentView(result?.appointment),
        payment: { url: paymentUrl, amount: depositAmount(), expiresAt: result.hold.expiresAt }
      });
      return;
    }

    const shouldRequestManagerApproval = Boolean(result?.createdCustomer);

    const confirmation = await sendBookingConfirmation({
      phone: otpSession.phone,
      date: confirmationDateTime.date,
      time: confirmationDateTime.time,
      requestManagerApproval: shouldRequestManagerApproval,
      customerName: result?.customer?.name,
      petName: result?.dog?.name || result?.customer?.petName,
      customerPhone: result?.customer?.phone
    }).catch((error) => ({
      ok: false,
      error: error?.message || 'Failed to send confirmation'
    }));

    res.status(200).json({
      ok: true,
      createdCustomer: result?.createdCustomer,
      customer: publicCustomerView(result?.customer),
      dog: publicDogView(result?.dog),
      appointment: publicAppointmentView(result?.appointment),
      confirmation: { ok: confirmation?.ok !== false, channel: confirmation?.channel }
    });
  } catch (error) {
    const apiError = toApiError(error);
    res.status(apiError.statusCode).json({
      ok: false,
      error: apiError.message
    });
  }
}
