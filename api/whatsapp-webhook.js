import {
  createAppointmentFromStructuredInput,
  toApiError
} from './_lib/appointments.js';
import { parseAppointmentMessage } from './_lib/whatsappParser.js';

const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN || '';
const webhookSecret = process.env.WHATSAPP_WEBHOOK_SECRET || '';

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

      res.status(200).json({
        ok: true,
        parsed,
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
