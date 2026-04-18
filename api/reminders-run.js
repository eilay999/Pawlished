import { listDueReminders, markReminderSent } from './_lib/reminders.js';

const whatsappToken = (process.env.WHATSAPP_TOKEN || '').trim();
const whatsappPhoneNumberId = (process.env.WHATSAPP_PHONE_NUMBER_ID || '').trim();
const cronSecret = (process.env.CRON_SECRET || process.env.WHATSAPP_WEBHOOK_SECRET || '').trim();

const canSendWhatsAppReply = () => Boolean(whatsappToken && whatsappPhoneNumberId);

const sendWhatsAppTextReply = async (to, bodyText) => {
  if (!canSendWhatsAppReply()) {
    throw new Error('Missing WHATSAPP_TOKEN or WHATSAPP_PHONE_NUMBER_ID');
  }

  const recipient = String(to || '').replace(/\D/g, '');
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

const buildReminderText = (reminder) => {
  if (reminder.source_kind === 'APPOINTMENT') {
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
    return true;
  }

  const authHeader = String(req.headers.authorization || '');
  if (authHeader === `Bearer ${cronSecret}`) {
    return true;
  }

  return req.headers['x-vercel-cron'] === '1';
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
        await sendWhatsAppTextReply(reminder.phone, buildReminderText(reminder));
        await markReminderSent(reminder.id);
        results.push({ id: reminder.id, sent: true });
      } catch (error) {
        results.push({ id: reminder.id, sent: false, reason: error?.message || 'Failed to send' });
      }
    }

    res.status(200).json({
      ok: true,
      processed: dueReminders.length,
      results
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error?.message || 'Server error'
    });
  }
}
