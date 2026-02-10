const normalizeDigits = (value = '') => value.replace(/\D/g, '');

const toWhatsAppNumber = (value = '') => {
  const digits = normalizeDigits(value);
  if (digits.startsWith('972')) return digits;
  if (digits.startsWith('0')) return `972${digits.slice(1)}`;
  return digits;
};

const whatsappToken = process.env.WHATSAPP_TOKEN;
const whatsappPhoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
const confirmTemplate = process.env.WHATSAPP_CONFIRM_TEMPLATE;
const confirmLang = process.env.WHATSAPP_CONFIRM_LANG || 'he';

const sendTemplate = async (to, templateName, lang, params) => {
  if (!whatsappToken || !whatsappPhoneId) {
    throw new Error('Missing WhatsApp credentials.');
  }
  const body = {
    messaging_product: 'whatsapp',
    to,
    type: 'template',
    template: {
      name: templateName,
      language: { code: lang },
      components: [
        {
          type: 'body',
          parameters: params.map((text) => ({ type: 'text', text }))
        }
      ]
    }
  };

  const resp = await fetch(`https://graph.facebook.com/v19.0/${whatsappPhoneId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${whatsappToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  if (!resp.ok) {
    const errorBody = await resp.text();
    throw new Error(`WhatsApp API error: ${errorBody}`);
  }
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const { phone, date, time } = req.body || {};
    if (!phone || !date || !time) {
      res.status(400).json({ error: 'Missing phone/date/time' });
      return;
    }
    if (!confirmTemplate) {
      res.status(500).json({ error: 'Missing WHATSAPP_CONFIRM_TEMPLATE' });
      return;
    }

    const waPhone = toWhatsAppNumber(phone);
    await sendTemplate(waPhone, confirmTemplate, confirmLang, [date, time]);
    res.status(200).json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Server error' });
  }
}
