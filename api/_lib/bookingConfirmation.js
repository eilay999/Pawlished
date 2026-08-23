const normalizeDigits = (value = '') => String(value || '').replace(/\D/g, '');

const toWhatsAppNumber = (value = '') => {
  const digits = normalizeDigits(value);
  if (!digits) return '';
  if (digits.startsWith('972')) return digits;
  if (digits.startsWith('0')) return `972${digits.slice(1)}`;
  if (String(value || '').trim().startsWith('+')) return digits;
  return digits;
};

const toE164 = (value = '') => {
  const digits = normalizeDigits(value);
  if (!digits) return '';
  if (digits.startsWith('972')) return `+${digits}`;
  if (digits.startsWith('0')) return `+972${digits.slice(1)}`;
  if (String(value || '').trim().startsWith('+')) return String(value || '').trim();
  return `+${digits}`;
};

const messagingChannel = (process.env.MESSAGING_CHANNEL || 'auto').toLowerCase().trim();

const whatsappToken = (process.env.WHATSAPP_TOKEN || '').trim();
const whatsappPhoneId = (process.env.WHATSAPP_PHONE_NUMBER_ID || '').trim();
const confirmTemplate = (process.env.WHATSAPP_CONFIRM_TEMPLATE || '').trim();
const confirmLang = (process.env.WHATSAPP_CONFIRM_LANG || 'he').trim();
const managerApprovalPhones = (process.env.MANAGER_APPROVAL_PHONES || '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);

const twilioAccountSid = process.env.TWILIO_ACCOUNT_SID;
const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN;
const twilioFromNumber = process.env.TWILIO_FROM_NUMBER;

const canUseWhatsApp = () => Boolean(whatsappToken && whatsappPhoneId && confirmTemplate);
const canUseSms = () => Boolean(twilioAccountSid && twilioAuthToken && twilioFromNumber);

const resolveChannel = () => {
  if (messagingChannel === 'sms') return 'sms';
  if (messagingChannel === 'whatsapp') return 'whatsapp';
  if (canUseWhatsApp()) return 'whatsapp';
  if (canUseSms()) return 'sms';
  return 'none';
};

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

const sendManagerApprovalRequest = async ({ date, time, customerName, petName, customerPhone }) => {
  if (managerApprovalPhones.length === 0) {
    return {
      requested: true,
      sent: false,
      reason: 'No MANAGER_APPROVAL_PHONES configured.'
    };
  }

  const safeCustomerName = (customerName || '').trim() || 'לקוח חדש';
  const safePetName = (petName || '').trim() || '-';
  const safeCustomerPhone = (customerPhone || '').trim() || '-';
  const smsBody =
    `בקשת אישור לתור חדש: ${date} בשעה ${time}. ` +
    `לקוח: ${safeCustomerName}. חיית מחמד: ${safePetName}. טלפון: ${safeCustomerPhone}.`;

  if (!canUseSms()) {
    return {
      requested: true,
      sent: false,
      reason: 'Missing Twilio SMS credentials for manager approval.'
    };
  }

  const phones = managerApprovalPhones.map((value) => toE164(value)).filter(Boolean);
  if (phones.length === 0) {
    return {
      requested: true,
      sent: false,
      reason: 'Manager approval phones are invalid.'
    };
  }

  await Promise.all(phones.map((value) => sendSmsMessage(value, smsBody)));
  return { requested: true, sent: true, channel: 'sms' };
};

export const sendBookingConfirmation = async ({
  phone,
  date,
  time,
  requestManagerApproval,
  customerName,
  petName,
  customerPhone
}) => {
  if (!phone || !date || !time) {
    throw new Error('Missing phone/date/time');
  }

  const channel = resolveChannel();

  if (channel === 'none') {
    throw new Error(
      'No messaging provider configured. Configure WhatsApp template vars or Twilio SMS vars.'
    );
  }

  if (channel === 'sms') {
    if (!canUseSms()) {
      throw new Error('Missing Twilio SMS credentials.');
    }
    const smsPhone = toE164(phone);
    if (!smsPhone) {
      throw new Error('Invalid phone');
    }
    await sendSmsMessage(smsPhone, `אישור תור: ${date} בשעה ${time}. תודה שקבעת אצלנו.`);
  } else {
    if (!canUseWhatsApp()) {
      throw new Error('Missing WHATSAPP_CONFIRM_TEMPLATE or WhatsApp credentials.');
    }
    const waPhone = toWhatsAppNumber(phone);
    if (!waPhone) {
      throw new Error('Invalid phone');
    }
    await sendWhatsAppTemplate(waPhone, confirmTemplate, confirmLang, [date, time]);
  }

  const shouldRequestManagerApproval = Boolean(requestManagerApproval);
  let managerApproval = null;
  if (shouldRequestManagerApproval) {
    try {
      managerApproval = await sendManagerApprovalRequest({
        date,
        time,
        customerName,
        petName,
        customerPhone
      });
    } catch (managerErr) {
      managerApproval = {
        requested: true,
        sent: false,
        reason: managerErr?.message || 'Failed to send manager approval request.'
      };
    }
  }

  return {
    ok: true,
    channel,
    ...(shouldRequestManagerApproval ? { managerApproval } : {})
  };
};

