import {
  createAppointmentFromStructuredInput,
  toApiError
} from './_lib/appointments.js';
import { parseAppointmentMessage } from './_lib/whatsappParser.js';

const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN || '';
const webhookSecret = process.env.WHATSAPP_WEBHOOK_SECRET || '';
const whatsappToken = process.env.WHATSAPP_TOKEN || '';
const whatsappPhoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID || '';
const ISRAEL_TIME_ZONE = 'Asia/Jerusalem';

const canSendWhatsAppReply = () => Boolean(whatsappToken && whatsappPhoneNumberId);

const normalizeWhatsAppNumber = (value = '') => String(value || '').replace(/\D/g, '');

const formatReplyDate = (value = '') => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) {
    return String(value || '').trim();
  }

  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  return new Intl.DateTimeFormat('he-IL', {
    timeZone: ISRAEL_TIME_ZONE,
    weekday: 'long',
    day: 'numeric',
    month: 'numeric'
  }).format(date);
};

const sendWhatsAppTextReply = async (to, bodyText) => {
  if (!canSendWhatsAppReply()) {
    return {
      sent: false,
      reason: 'Missing WHATSAPP_TOKEN or WHATSAPP_PHONE_NUMBER_ID'
    };
  }

  const recipient = normalizeWhatsAppNumber(to);
  if (!recipient) {
    return {
      sent: false,
      reason: 'Missing recipient phone number'
    };
  }

  const response = await fetch(
    `https://graph.facebook.com/v19.0/${whatsappPhoneNumberId}/messages`,
    {
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
    }
  );

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`WhatsApp reply error: ${errorBody}`);
  }

  return { sent: true };
};

const buildConfirmationText = ({ customerName, date, time, service }) =>
  `התור של ${customerName} נקבע ל${formatReplyDate(date)} בשעה ${time} עבור ${service}.`;

const getProvidedSecret = (req) =>
  req.headers['x-webhook-secret'] ||
  req.headers['x-api-secret'] ||
  req.body?.secret ||
  '';

const isMetaPayload = (body) =>
  body?.object === 'whatsapp_business_account' || Boolean(body?.entry?.[0]?.changes?.[0]?.value);

const extractIncomingMessage = (body) => {
  if (typeof body?.text === 'string') {
    return {
      text: body.text,
      from: body.from || '',
      type: 'text'
    };
  }

  const message = body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
  return {
    text: message?.text?.body || '',
    from: message?.from || '',
    type: message?.type || ''
  };
};

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && verifyToken && token === verifyToken) {
      res.status(200).send(challenge);
      return;
    }

    res.status(403).send('Forbidden');
    return;
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    res.status(405).json({ ok: false, error: 'Method not allowed' });
    return;
  }

  if (webhookSecret && !isMetaPayload(req.body)) {
    const providedSecret = String(getProvidedSecret(req));
    if (!providedSecret || providedSecret !== webhookSecret) {
      res.status(401).json({ ok: false, error: 'Unauthorized webhook call' });
      return;
    }
  }

  try {
    const incoming = extractIncomingMessage(req.body || {});
    if (!incoming.text) {
      res.status(200).json({
        ok: true,
        ignored: true,
        reason: incoming.type ? `Unsupported message type: ${incoming.type}` : 'No message text received'
      });
      return;
    }

    let parsed;
    try {
      parsed =
        req.body?.parsed && typeof req.body.parsed === 'object'
          ? req.body.parsed
          : parseAppointmentMessage(incoming.text);
    } catch (error) {
      res.status(200).json({
        ok: true,
        accepted: false,
        reason: error?.message || 'Could not parse message',
        receivedText: incoming.text
      });
      return;
    }

    try {
      const result = await createAppointmentFromStructuredInput({
        existingCustomerId: req.body?.existingCustomerId,
        customerName: parsed.customerName,
        phone:
          req.body?.customerPhone ||
          parsed.customerPhone ||
          incoming.from ||
          '',
        date: parsed.date,
        time: parsed.time,
        service: parsed.service,
        notes: parsed.notes || incoming.text,
        petName: req.body?.petName || parsed.petName,
        petType: req.body?.petType || parsed.petType,
        price: req.body?.price
      });

      let confirmation = null;
      const replyPhone =
        incoming.from ||
        req.body?.customerPhone ||
        parsed.customerPhone ||
        result.customer?.phone ||
        '';

      if (replyPhone) {
        try {
          confirmation = await sendWhatsAppTextReply(
            replyPhone,
            buildConfirmationText({
              customerName: result.customer?.name || parsed.customerName,
              date: parsed.date,
              time: parsed.time,
              service: parsed.service
            })
          );
        } catch (replyError) {
          confirmation = {
            sent: false,
            reason: replyError?.message || 'Failed to send confirmation reply'
          };
        }
      }

      res.status(200).json({
        ok: true,
        parsed,
        confirmation,
        ...result
      });
    } catch (error) {
      const apiError = toApiError(error);
      if (apiError.statusCode < 500) {
        res.status(200).json({
          ok: true,
          accepted: false,
          parsed,
          reason: apiError.message
        });
        return;
      }

      throw error;
    }
  } catch (error) {
    const apiError = toApiError(error);
    res.status(apiError.statusCode).json({
      ok: false,
      error: apiError.message
    });
  }
}
