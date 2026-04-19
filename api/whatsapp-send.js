import { logWhatsAppMessage } from './_lib/whatsappMessages.js';

const whatsappToken = (process.env.WHATSAPP_TOKEN || '').trim();
const whatsappPhoneNumberId = (process.env.WHATSAPP_PHONE_NUMBER_ID || '').trim();

const normalizeDigits = (value = '') => String(value || '').replace(/\D/g, '');

const toWhatsAppNumber = (value = '') => {
  const digits = normalizeDigits(value);
  if (!digits) return '';
  if (digits.startsWith('972')) return digits;
  if (digits.startsWith('0')) return `972${digits.slice(1)}`;
  return digits;
};

const canSendWhatsApp = () => Boolean(whatsappToken && whatsappPhoneNumberId);

const sendWhatsAppText = async (to, bodyText) => {
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
        to,
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
    throw new Error(`WhatsApp API error: ${errorBody}`);
  }
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ ok: false, error: 'Method not allowed' });
    return;
  }

  try {
    const { phone, body } = req.body || {};

    if (!phone || !body) {
      res.status(400).json({ ok: false, error: 'Missing phone/body' });
      return;
    }

    if (!canSendWhatsApp()) {
      res.status(500).json({
        ok: false,
        error: 'Missing WHATSAPP_TOKEN or WHATSAPP_PHONE_NUMBER_ID'
      });
      return;
    }

    const recipient = toWhatsAppNumber(phone);
    if (!recipient) {
      res.status(400).json({ ok: false, error: 'Invalid phone' });
      return;
    }

    const text = String(body || '').trim();
    if (!text) {
      res.status(400).json({ ok: false, error: 'Empty message' });
      return;
    }

    await sendWhatsAppText(recipient, text);

    const logged = await logWhatsAppMessage({
      phone: recipient,
      direction: 'OUTGOING',
      body: text,
      intentKind: 'human_reply',
      metadata: {
        via: 'ui'
      }
    }).catch(() => null);

    res.status(200).json({ ok: true, sent: true, logged: Boolean(logged) });
  } catch (err) {
    res.status(500).json({ ok: false, error: err?.message || 'Server error' });
  }
}
