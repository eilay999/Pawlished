import test from 'node:test';
import assert from 'node:assert/strict';

for (const key of ['WHATSAPP_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID', 'TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_FROM_NUMBER', 'WHATSAPP_PAYMENT_TEMPLATE']) {
  delete process.env[key];
}
delete process.env.MESSAGING_DRY_RUN;

const { deliverCustomerMessage } = await import('../api/_lib/outbound.js');
const { sendPaymentRequest } = await import('../api/_lib/bookingConfirmation.js');

const calls = [];
let failTemplate = false;
let failSms = false;
globalThis.fetch = async (url, init = {}) => {
  const target = String(url);
  const body = init.body && String(init.body).startsWith('{') ? JSON.parse(init.body) : String(init.body || '');
  calls.push({ target, body });
  if (target.includes('graph.facebook.com') && body.type === 'template' && failTemplate) {
    return { ok: false, status: 400, text: async () => '{"error":{"code":132001,"message":"template does not exist"}}' };
  }
  if (target.includes('api.twilio.com') && failSms) {
    return { ok: false, status: 500, text: async () => 'sms down' };
  }
  return { ok: true, status: 200, text: async () => '{}' };
};

const withWhatsapp = () => {
  process.env.WHATSAPP_TOKEN = 't';
  process.env.WHATSAPP_PHONE_NUMBER_ID = '123';
};
const withSms = () => {
  process.env.TWILIO_ACCOUNT_SID = 'AC1';
  process.env.TWILIO_AUTH_TOKEN = 'secret';
  process.env.TWILIO_FROM_NUMBER = '+15550001111';
};
const reset = () => {
  calls.length = 0;
  failTemplate = false;
  failSms = false;
  for (const key of ['WHATSAPP_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID', 'TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_FROM_NUMBER', 'WHATSAPP_PAYMENT_TEMPLATE']) delete process.env[key];
};

const TEMPLATE = { name: 'pawlished_day_before_he', params: ['נועה', '10:00'] };

test('an approved template is sent first and is enough', async () => {
  reset();
  withWhatsapp();
  const result = await deliverCustomerMessage({ phone: '0501234567', template: TEMPLATE, text: 'plain' });
  assert.deepEqual(result, { ok: true, channel: 'whatsapp-template' });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].body.type, 'template');
  assert.equal(calls[0].body.to, '972501234567');
  assert.deepEqual(calls[0].body.template.components[0].parameters.map((p) => p.text), ['נועה', '10:00']);
});

test('a rejected template falls back to SMS, not to an unreliable free-form text', async () => {
  reset();
  withWhatsapp();
  withSms();
  failTemplate = true;
  const result = await deliverCustomerMessage({ phone: '0501234567', template: TEMPLATE, text: 'plain' });
  assert.equal(result.channel, 'sms');
  assert.equal(calls.filter((c) => c.body.type === 'text').length, 0);
});

test('without a template or SMS the free-form text is the last resort', async () => {
  reset();
  withWhatsapp();
  const result = await deliverCustomerMessage({ phone: '0501234567', template: null, text: 'plain' });
  assert.equal(result.channel, 'whatsapp-freeform');
  assert.equal(calls[0].body.type, 'text');
});

test('failures are reported, never thrown', async () => {
  reset();
  assert.equal((await deliverCustomerMessage({ phone: '0501234567', text: 'x' })).ok, false);
  withWhatsapp();
  withSms();
  failTemplate = true;
  failSms = true;
  // template fails, SMS fails, free-form is accepted by the API
  assert.equal((await deliverCustomerMessage({ phone: '0501234567', template: TEMPLATE, text: 'x' })).channel, 'whatsapp-freeform');
  assert.equal((await deliverCustomerMessage({ phone: '', text: 'x' })).ok, false);
});

test('the payment request uses the payment template with name, date, time, amount, minutes and link', async () => {
  reset();
  withWhatsapp();
  process.env.WHATSAPP_PAYMENT_TEMPLATE = 'pawlished_payment_he';
  const result = await sendPaymentRequest({
    phone: '0501234567',
    date: '15.10.2026',
    time: '10:00',
    url: 'https://pay.test/abc',
    amount: 50,
    holdMinutes: 30,
    customerName: 'נועה לוי'
  });
  assert.equal(result.channel, 'whatsapp-template');
  const sent = calls[0].body.template;
  assert.equal(sent.name, 'pawlished_payment_he');
  assert.deepEqual(sent.components[0].parameters.map((p) => p.text), ['נועה', '15.10.2026', '10:00', '50', '30', 'https://pay.test/abc']);
});
