import './dryRun.js';

// One place for messages that go to customers outside any conversation (day-before reminders,
// payment requests). WhatsApp only delivers a free-form text inside 24h of the customer's last
// message and says "200 OK" even when it will not be delivered, so a free-form send can never be
// trusted. The order is therefore:
//   1. an approved WhatsApp template (reaches everyone; the API reports a bad template at once),
//   2. SMS when Twilio is configured,
//   3. free-form WhatsApp as the last resort (works only inside the 24h window).
// Environment is read at call time so tests and config changes need no re-import.

const digits = (value = '') => String(value || '').replace(/\D/g, '');

export const toWhatsAppNumber = (value = '') => {
  const d = digits(value);
  if (!d) return '';
  if (d.startsWith('972')) return d;
  if (d.startsWith('0')) return `972${d.slice(1)}`;
  return d;
};

export const toE164 = (value = '') => {
  const d = digits(value);
  if (!d) return '';
  if (d.startsWith('972')) return `+${d}`;
  if (d.startsWith('0')) return `+972${d.slice(1)}`;
  return `+${d}`;
};

const env = (name) => (process.env[name] || '').trim();
const whatsappReady = () => Boolean(env('WHATSAPP_TOKEN') && env('WHATSAPP_PHONE_NUMBER_ID'));
const smsReady = () => Boolean(env('TWILIO_ACCOUNT_SID') && env('TWILIO_AUTH_TOKEN') && env('TWILIO_FROM_NUMBER'));

const graphSend = async (payload) => {
  const resp = await fetch(`https://graph.facebook.com/v19.0/${env('WHATSAPP_PHONE_NUMBER_ID')}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env('WHATSAPP_TOKEN')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', ...payload })
  });
  if (!resp.ok) {
    throw new Error(`WhatsApp API error: ${await resp.text()}`);
  }
};

export const sendWhatsAppTemplateMessage = ({ to, name, lang = 'he', params = [] }) =>
  graphSend({
    to,
    type: 'template',
    template: {
      name,
      language: { code: lang },
      components: [{ type: 'body', parameters: params.map((text) => ({ type: 'text', text: String(text) })) }]
    }
  });

export const sendWhatsAppFreeformMessage = ({ to, text }) =>
  graphSend({ to, type: 'text', text: { preview_url: true, body: text } });

export const sendSmsText = async ({ to, text }) => {
  const sid = env('TWILIO_ACCOUNT_SID');
  const auth = Buffer.from(`${sid}:${env('TWILIO_AUTH_TOKEN')}`).toString('base64');
  const resp = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ To: to, From: env('TWILIO_FROM_NUMBER'), Body: text }).toString()
  });
  if (!resp.ok) {
    throw new Error(`Twilio SMS API error: ${await resp.text()}`);
  }
};

// template: { name, lang?, params } (optional). text: the plain message for SMS / free-form.
export const deliverCustomerMessage = async ({ phone, template, text }) => {
  const waPhone = toWhatsAppNumber(phone);
  const smsPhone = toE164(phone);
  if (!waPhone || !smsPhone) return { ok: false, error: 'Invalid phone' };

  const errors = [];

  if (template?.name && whatsappReady()) {
    try {
      await sendWhatsAppTemplateMessage({ to: waPhone, name: template.name, lang: template.lang || 'he', params: template.params || [] });
      return { ok: true, channel: 'whatsapp-template' };
    } catch (error) {
      errors.push(error?.message || String(error));
    }
  }

  if (smsReady()) {
    try {
      await sendSmsText({ to: smsPhone, text });
      return { ok: true, channel: 'sms' };
    } catch (error) {
      errors.push(error?.message || String(error));
    }
  }

  if (whatsappReady()) {
    try {
      await sendWhatsAppFreeformMessage({ to: waPhone, text });
      // Accepted by the API; delivery outside the 24h window is not guaranteed.
      return { ok: true, channel: 'whatsapp-freeform' };
    } catch (error) {
      errors.push(error?.message || String(error));
    }
  }

  return { ok: false, error: errors.at(-1) || 'No messaging provider configured' };
};
