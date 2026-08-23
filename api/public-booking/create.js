import {
  buildSlotDateFromLocal,
  createAppointmentRecord,
  toApiError
} from '../_lib/appointments.js';
import { requireOtpSession } from '../_lib/otpSession.js';
import { sendBookingConfirmation } from '../_lib/bookingConfirmation.js';

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
    const {
      slotDate,
      date,
      time,
      customer,
      service,
      notes,
      price,
      visitFrequencyWeeks
    } = req.body || {};

    const resolvedSlotDate =
      date && time
        ? buildSlotDateFromLocal(date, time)
        : slotDate;

    const result = await createAppointmentRecord({
      phone: otpSession.phone,
      slotDate: resolvedSlotDate,
      existingCustomerId: undefined,
      customer: customer ? { ...customer, phone: otpSession.phone } : undefined,
      customerName: customer?.name,
      service,
      notes,
      price,
      visitFrequencyWeeks,
      allowNewCustomerDefaults: true
    });

    const confirmationDateTime = deriveConfirmationDateTime({
      date,
      time,
      slotDate: result?.appointment?.date || resolvedSlotDate
    });

    const shouldRequestManagerApproval = Boolean(result?.createdCustomer);

    const confirmation = await sendBookingConfirmation({
      phone: otpSession.phone,
      date: confirmationDateTime.date,
      time: confirmationDateTime.time,
      requestManagerApproval: shouldRequestManagerApproval,
      customerName: result?.customer?.name,
      petName: result?.customer?.petName,
      customerPhone: result?.customer?.phone
    }).catch((error) => ({
      ok: false,
      error: error?.message || 'Failed to send confirmation'
    }));

    res.status(200).json({
      ok: true,
      ...result,
      confirmation
    });
  } catch (error) {
    const apiError = toApiError(error);
    res.status(apiError.statusCode).json({
      ok: false,
      error: apiError.message
    });
  }
}
