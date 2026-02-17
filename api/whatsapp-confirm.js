const normalizeDigits = (value = '') => value.replace(/\D/g, '');

const toWhatsAppNumber = (value = '') => {
  const digits = normalizeDigits(value);
  if (digits.startsWith('972')) return digits;
  if (digits.startsWith('0')) return `972${digits.slice(1)}`;
  return digits;
};

const toE164 = (value = '') => {
  const digits = normalizeDigits(value);
  if (!digits) return '';
  if (digits.startsWith('972')) return `+${digits}`;
  if (digits.startsWith('0')) return `+972${digits.slice(1)}`;
  if (value.startsWith('+')) return value;
  return `+${digits}`;
};

const messagingChannel = (process.env.MESSAGING_CHANNEL || 'auto').toLowerCase();

const whatsappToken = process.env.WHATSAPP_TOKEN;
const whatsappPhoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
const confirmTemplate = process.env.WHATSAPP_CONFIRM_TEMPLATE;
const confirmLang = process.env.WHATSAPP_CONFIRM_LANG || 'he';

const twilioAccountSid = process.env.TWILIO_ACCOUNT_SID;
const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN;
const twilioFromNumber = process.env.TWILIO_FROM_NUMBER;

const canUseWhatsApp = () => Boolean(whatsappToken && whatsappPhoneId && confirmTemplate);
const canUseSms = () => Boolean(twilioAccountSid && twilioAuthToken && twilioFromNumber);

const sendWhatsAppTemplate = async (to, templateName, lang, params) => {
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

const sendSmsMessage = async (to, bodyText) => {
  const auth = Buffer.from(`${twilioAccountSid}:${twilioAuthToken}`).toString('base64');
  const payload = new URLSearchParams({
    To: to,
    From: twilioFromNumber,
    Body: bodyText
  });

  const resp = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Messages.json`,
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: payload.toString()
    }
  );

  if (!resp.ok) {
    const errorBody = await resp.text();
    throw new Error(`Twilio SMS API error: ${errorBody}`);
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

    const channel =
      messagingChannel === 'sms'
        ? 'sms'
        : messagingChannel === 'whatsapp'
          ? 'whatsapp'
          : canUseWhatsApp()
            ? 'whatsapp'
            : canUseSms()
              ? 'sms'
              : 'none';

    if (channel === 'none') {
      res.status(500).json({
        error:
          'No messaging provider configured. Configure WhatsApp template vars or Twilio SMS vars.'
      });
      return;
    }

    if (channel === 'sms') {
      if (!canUseSms()) {
        res.status(500).json({ error: 'Missing Twilio SMS credentials.' });
        return;
      }
      const smsPhone = toE164(phone);
      if (!smsPhone) {
        res.status(400).json({ error: 'Invalid phone' });
        return;
      }
      await sendSmsMessage(smsPhone, `אישור תור: ${date} בשעה ${time}. תודה שקבעת אצלנו.`);
      res.status(200).json({ ok: true, channel: 'sms' });
      return;
    }

    const waPhone = toWhatsAppNumber(phone);
    await sendWhatsAppTemplate(waPhone, confirmTemplate, confirmLang, [date, time]);
    res.status(200).json({ ok: true, channel: 'whatsapp' });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Server error' });
  }
}
