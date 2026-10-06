import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { createFakeSupabase } from './fakeSupabase.mjs';
import { forwardToBako, hasBakoSender, normalizeForwardPhone, parseForwardPhones } from '../api/_lib/bakoForward.js';

const payloadFrom = (from, text = 'הוצאה 50 קפה') =>
  JSON.stringify({
    object: 'whatsapp_business_account',
    entry: [{ changes: [{ value: { messages: [{ from, type: 'text', text: { body: text } }] } }] }]
  });

test('phone numbers are matched in every format Israelis write them', () => {
  assert.equal(normalizeForwardPhone('052-707-5624'), '972527075624');
  assert.equal(normalizeForwardPhone('+972527075624'), '972527075624');
  assert.equal(normalizeForwardPhone('00972527075624'), '972527075624');
  const phones = parseForwardPhones('0527075624, 0501234567,12');
  assert.equal(phones.size, 2);
  assert.equal(hasBakoSender(JSON.parse(payloadFrom('972527075624')), phones), true);
  assert.equal(hasBakoSender(JSON.parse(payloadFrom('972509999999')), phones), false);
  assert.equal(hasBakoSender({}, phones), false);
  assert.equal(hasBakoSender(JSON.parse(payloadFrom('972527075624')), new Set()), false);
});

test('the original bytes and Meta signature are forwarded untouched', async () => {
  const calls = [];
  const raw = Buffer.from(payloadFrom('972527075624'));
  const result = await forwardToBako({
    raw,
    signature: 'sha256=abc',
    url: 'https://bako.example/api/webhook',
    secret: 's3',
    fetchImpl: async (url, init) => { calls.push({ url, init }); return { ok: true, status: 200 }; }
  });
  assert.deepEqual(result, { ok: true, status: 200 });
  assert.equal(calls[0].url, 'https://bako.example/api/webhook');
  assert.equal(calls[0].init.body, raw);
  assert.equal(calls[0].init.headers['X-Hub-Signature-256'], 'sha256=abc');
  assert.equal(calls[0].init.headers['X-Bako-Forward-Secret'], 's3');
});

test('a failing receiver never throws', async () => {
  const result = await forwardToBako({ raw: Buffer.from('{}'), url: 'https://x', fetchImpl: async () => { throw new Error('down'); } });
  assert.equal(result.ok, false);
});

// --- whole handler: forwarded only for Bako's phones, everything else stays here ---
process.env.OTP_SECRET = 'a-long-test-secret-of-more-than-32-characters';
process.env.SUPABASE_URL = 'https://fake.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake';
process.env.WHATSAPP_WEBHOOK_SECRET = 'live-secret';
process.env.BAKO_FORWARD_PHONES = '0527075624';
process.env.BAKO_WEBHOOK_URL = 'https://bako.example/api/webhook';
process.env.WHATSAPP_ASSISTANT_DISABLED = 'true';
delete process.env.VERCEL_ENV;
const fake = createFakeSupabase({});
mock.module('@supabase/supabase-js', { namedExports: { createClient: () => fake.client } });
const webhook = (await import('../api/whatsapp-webhook.js')).default;

const post = async (raw, { secret = 'live-secret', signature = 'sha256=sig' } = {}) => {
  const req = Readable.from([Buffer.from(raw)]);
  req.method = 'POST';
  req.query = { secret };
  req.headers = { 'content-type': 'application/json', 'x-hub-signature-256': signature };
  const res = { setHeader() {}, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; }, send(body) { this.body = body; return this; } };
  await webhook(req, res);
  return res;
};

test('handler forwards Bako\'s messages byte for byte and answers 200', async () => {
  const sent = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => { sent.push({ url, init }); return { ok: true, status: 200 }; };
  try {
    const raw = payloadFrom('972527075624');
    const res = await post(raw);
    assert.equal(res.code, 200);
    assert.equal(res.body.forwarded, true);
    assert.equal(sent.length, 1);
    assert.equal(sent[0].url, 'https://bako.example/api/webhook');
    assert.equal(Buffer.from(sent[0].init.body).toString(), raw);
    assert.equal(sent[0].init.headers['X-Hub-Signature-256'], 'sha256=sig');
  } finally { globalThis.fetch = realFetch; }
});

test('handler does not forward other customers\' messages and still enforces the secret', async () => {
  const sent = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => { sent.push({ url, init }); return { ok: true, status: 200 }; };
  try {
    const other = await post(payloadFrom('972509999999'));
    assert.equal(other.code, 200);
    assert.equal(sent.length, 0);
    const wrong = await post(payloadFrom('972527075624'), { secret: 'nope' });
    assert.equal(wrong.code, 401);
    assert.equal(sent.length, 0, 'unauthenticated requests are never forwarded');
  } finally { globalThis.fetch = realFetch; }
});
