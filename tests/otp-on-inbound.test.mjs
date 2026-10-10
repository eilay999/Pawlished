import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { createFakeSupabase } from './fakeSupabase.mjs';

process.env.SUPABASE_URL = 'https://fake.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake';
process.env.OTP_SECRET = 'a-long-test-secret-of-more-than-32-characters';
process.env.WHATSAPP_TOKEN = 'token';
process.env.WHATSAPP_PHONE_NUMBER_ID = '123';
process.env.WHATSAPP_WEBHOOK_SECRET = 'live-secret';
process.env.WHATSAPP_ASSISTANT_DISABLED = 'true';
delete process.env.VERCEL_ENV;

const PHONE = '972501234567';
const iso = (offsetMs) => new Date(Date.now() + offsetMs).toISOString();
const fake = createFakeSupabase({ wa_otp: [] });
mock.module('@supabase/supabase-js', { namedExports: { createClient: () => fake.client } });

const sent = [];
globalThis.fetch = async (url, init = {}) => {
  sent.push({ url: String(url), body: init.body ? JSON.parse(init.body) : null });
  return { ok: true, status: 200, text: async () => '{}', json: async () => ({}) };
};

const otp = await import('../api/whatsapp-otp.js');
const webhook = (await import('../api/whatsapp-webhook.js')).default;

const reset = (rows = []) => {
  fake.db.wa_otp.length = 0;
  fake.db.wa_otp.push(...rows);
  sent.length = 0;
};
const pendingRow = (extra = {}) => ({
  phone: PHONE,
  code_hash: 'x',
  created_at: iso(-20_000),
  expires_at: iso(9 * 60_000),
  used_at: null,
  ...extra
});
const codeFromLastSend = () => /(\d{6})/.exec(sent.at(-1).body.text.body)[1];

const callHandler = async (body) => {
  const res = { setHeader() {}, status(code) { this.code = code; return this; }, json(payload) { this.body = payload; return this; } };
  await otp.default({ method: 'POST', body, headers: {}, query: {} }, res);
  return res;
};

test('a person who asked for a code and then writes to the number gets the code', async () => {
  reset([pendingRow()]);
  const result = await otp.deliverOtpOnInbound(PHONE);
  assert.equal(result.sent, true);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].body.to, PHONE);
  assert.match(sent[0].body.text.body, /\d{6}/);

  // The delivered code really logs in.
  const verified = await callHandler({ action: 'verify', phone: '0501234567', code: codeFromLastSend() });
  assert.equal(verified.code, 200);
  assert.ok(verified.body.sessionToken);
});

test('nobody gets a code just for writing in: a request must be pending', async () => {
  reset([]);
  assert.equal((await otp.deliverOtpOnInbound(PHONE)).reason, 'no-pending-request');
  reset([pendingRow({ used_at: iso(-1000) })]);
  assert.equal((await otp.deliverOtpOnInbound(PHONE)).reason, 'no-pending-request');
  reset([pendingRow({ expires_at: iso(-1000) })]);
  assert.equal((await otp.deliverOtpOnInbound(PHONE)).reason, 'no-pending-request');
  reset([pendingRow({ phone: '972509999999' })]);
  assert.equal((await otp.deliverOtpOnInbound(PHONE)).reason, 'no-pending-request');
  assert.equal(sent.length, 0);
});

test('repeated messages cannot be used to flood a phone with codes', async () => {
  reset(Array.from({ length: 5 }, () => pendingRow()));
  const result = await otp.deliverOtpOnInbound(PHONE);
  assert.equal(result.sent, false);
  assert.equal(result.reason, 'rate-limited');
  assert.equal(sent.length, 0);
});

test('the webhook delivers the code when the message arrives', async () => {
  reset([pendingRow()]);
  const raw = JSON.stringify({
    object: 'whatsapp_business_account',
    entry: [{ changes: [{ value: { messages: [{ from: PHONE, type: 'text', text: { body: 'היי' } }] } }] }]
  });
  const req = Readable.from([Buffer.from(raw)]);
  req.method = 'POST';
  req.query = { secret: 'live-secret' };
  req.headers = { 'content-type': 'application/json' };
  const res = { setHeader() {}, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; }, send(body) { this.body = body; return this; } };
  await webhook(req, res);
  assert.equal(res.code, 200);
  const whatsappSends = sent.filter((call) => call.url.includes('/messages'));
  assert.equal(whatsappSends.length, 1);
  assert.equal(whatsappSends[0].body.to, PHONE);
});

test('a wrong webhook secret delivers nothing', async () => {
  reset([pendingRow()]);
  const raw = JSON.stringify({ entry: [{ changes: [{ value: { messages: [{ from: PHONE, type: 'text', text: { body: 'היי' } }] } }] }] });
  const req = Readable.from([Buffer.from(raw)]);
  req.method = 'POST';
  req.query = { secret: 'nope' };
  req.headers = { 'content-type': 'application/json' };
  const res = { setHeader() {}, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; }, send(body) { this.body = body; return this; } };
  await webhook(req, res);
  assert.equal(res.code, 401);
  assert.equal(sent.length, 0);
});
