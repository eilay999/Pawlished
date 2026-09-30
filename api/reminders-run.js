import { safeEqual } from './_lib/safeCompare.js';
import { listDueReminders, markReminderSent } from './_lib/reminders.js';
import { logWhatsAppMessage } from './_lib/whatsappMessages.js';
import { issuePendingInvoices } from './_lib/invoices.js';
import { depositAmount, getDepositLinkForAppointment } from './_lib/grow.js';

const whatsappToken = (process.env.WHATSAPP_TOKEN || '').trim();
const whatsappPhoneNumberId = (process.env.WHATSAPP_PHONE_NUMBER_ID || '').trim();
const cronSecret = (process.env.CRON_SECRET || process.env.WHATSAPP_WEBHOOK_SECRET || '').trim();

const bitPaymentLink = (process.env.BIT_PAYMENT_LINK || '').trim();

const reminderProviderLabel = (process.env.REMINDER_PROVIDER_LABEL || 'Pawlished').trim();

const canSendWhatsAppReply = () => Boolean(whatsappToken && whatsappPhoneNumberId);

const normalizeDigits = (value = '') => String(value || '').replace(/\D/g, '');

const toWhatsAppNumber = (value = '') => {
  const digits = normalizeDigits(value);
  if (!digits) return '';
  if (digits.startsWith('972')) return digits;
  if (digits.startsWith('0')) return `972${digits.slice(1)}`;
  if (String(value || '').trim().startsWith('+')) return digits;
  return digits;
};

const sendWhatsAppTextReply = async (to, bodyText) => {
  if (!canSendWhatsAppReply()) {
    throw new Error('Missing WHATSAPP_TOKEN or WHATSAPP_PHONE_NUMBER_ID');
  }

  const recipient = toWhatsAppNumber(to);
  if (!recipient) {
    throw new Error('Missing recipient phone number');
  }

  const response = await fetch(`https://graph.facebook.com/v19.0/${whatsappPhoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${whatsappToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: recipient,
      type: 'text',
      text: {
        preview_url: false,
        body: bodyText
      }
    })
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`WhatsApp reminder error: ${errorBody}`);
  }
};

const buildDayBeforeAppointmentText = (reminder, paymentLink = '') => {
  const appointmentTime = reminder.payload?.time ? `בשעה ${reminder.payload.time}` : '';
  const appointmentDate = reminder.payload?.date ? ` (${reminder.payload.date})` : '';
  const customerLabel = reminder.payload?.customerName || reminder.title;
  const petLabel = reminder.payload?.petName ? ` (${reminder.payload.petName})` : '';
  const providerLabel = reminderProviderLabel ? `ל${reminderProviderLabel}` : 'אלינו';
  const timePart = appointmentTime ? ` ${appointmentTime}` : '';

  return (
    `היי ${customerLabel}${petLabel} 😊\n` +
    `תזכורת ליום מחר${appointmentDate}: יש לך תור ${providerLabel}${timePart}.` +
    `\nנשמח לאישור הגעה — השיבו *1* לאישור.` +
    `\nלשינוי או ביטול אפשר לענות להודעה הזו.` +
    (paymentLink
      ? `\n\nדמי קביעה וביטול של ₪${depositAmount()} (יקוזזו מהתשלום) — אפשר לשלם בכרטיס או בביט: ${paymentLink}`
      : '')
  );
};

const buildReminderText = (reminder, paymentLink = '') => {
  if (reminder.source_kind === 'APPOINTMENT') {
    const reminderKind = String(reminder.payload?.reminderKind || '').trim().toUpperCase();
    if (reminderKind === 'DAY_BEFORE') {
      return buildDayBeforeAppointmentText(reminder, paymentLink);
    }

    const appointmentTime = reminder.payload?.time ? ` בשעה ${reminder.payload.time}` : '';
    const customerLabel = reminder.payload?.customerName || reminder.title;
    const petLabel = reminder.payload?.petName ? ` (${reminder.payload.petName})` : '';
    return `תזכורת: בעוד שעה יש ל-${customerLabel}${petLabel} תור${appointmentTime}.`;
  }

  if (reminder.source_kind === 'EVENT') {
    return `תזכורת לבוקר: היום יש ${reminder.title}.`;
  }

  return `תזכורת: ${reminder.title}`;
};

const isAuthorized = (req) => {
  if (!cronSecret) {
    // Avoid leaving a public endpoint that can send messages.
    return process.env.NODE_ENV !== 'production';
  }

  const authHeader = String(req.headers.authorization || '');
  return safeEqual(authHeader, `Bearer ${cronSecret}`);
};

export default async function handler(req, res) {
  if (!['GET', 'POST'].includes(req.method)) {
    res.setHeader('Allow', 'GET, POST');
    res.status(405).json({ ok: false, error: 'Method not allowed' });
    return;
  }

  if (!isAuthorized(req)) {
    res.status(401).json({ ok: false, error: 'Unauthorized' });
    return;
  }

  try {
    const dueReminders = await listDueReminders();
    const results = [];

    for (const reminder of dueReminders) {
      try {
        let paymentLink = '';
        if (reminder.source_kind === 'APPOINTMENT' && reminder.payload?.reminderKind === 'DAY_BEFORE') {
          // Grow payment link (card/Bit) when configured; otherwise the static Bit link, if any.
          paymentLink = await getDepositLinkForAppointment(reminder.source_id).catch(() => null) || bitPaymentLink;
        }
        const text = buildReminderText(reminder, paymentLink);
        await sendWhatsAppTextReply(reminder.phone, text);
        await logWhatsAppMessage({
          phone: reminder.phone,
          direction: 'OUTGOING',
          body: text,
          intentKind: reminder.payload?.reminderKind === 'DAY_BEFORE' ? 'appointment_day_before' : 'reminder',
          metadata: {
            via: 'cron',
            reminderId: reminder.id,
            sourceKind: reminder.source_kind,
            sourceId: reminder.source_id || null
          }
        }).catch(() => null);
        await markReminderSent(reminder.id);
        results.push({ id: reminder.id, sent: true });
      } catch (error) {
        results.push({ id: reminder.id, sent: false, reason: error?.message || 'Failed to send' });
      }
    }

    const invoices = [];
    try {
      const issued = await issuePendingInvoices();
      for (const doc of issued) {
        let sent = false;
        if (doc.phone && doc.url) {
          const text =
            `היי ${doc.customerName || ''} 😊 תודה שבחרתם ב${reminderProviderLabel}!\n` +
            `החשבונית שלכם${doc.number ? ` (מס' ${doc.number})` : ''}: ${doc.url}`;
          try {
            await sendWhatsAppTextReply(doc.phone, text);
            sent = true;
          } catch {
            // invoice exists; delivery can be retried manually
          }
        }
        invoices.push({ appointmentId: doc.appointmentId, number: doc.number, sent });
      }
    } catch (invoiceError) {
      invoices.push({ error: invoiceError?.message || 'Invoice run failed' });
    }

    res.status(200).json({
      ok: true,
      processed: dueReminders.length,
      results,
      invoices
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error?.message || 'Server error'
    });
  }
}
