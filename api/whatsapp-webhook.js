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
      from: body.from || ''
    };
  }

  const message = body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
  return {
    text: message?.text?.body || '',
    from: message?.from || ''
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
      res.status(400).json({ ok: false, error: 'No message text received' });
      return;
    }

    const parsed =
      req.body?.parsed && typeof req.body.parsed === 'object'
        ? req.body.parsed
        : parseAppointmentMessage(incoming.text);

    const result = await createAppointmentFromStructuredInput({
      existingCustomerId: req.body?.existingCustomerId,
      customerName: parsed.customerName,
      phone:
        req.body?.customerPhone ||
        parsed.customerPhone ||
        (req.body?.useSenderPhone ? incoming.from : ''),
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
    res.status(apiError.statusCode).json({
      ok: false,
      error: apiError.message
    });
  }
}
