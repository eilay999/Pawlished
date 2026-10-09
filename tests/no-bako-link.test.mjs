import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { Readable } from 'node:stream';
import { createFakeSupabase } from './fakeSupabase.mjs';

// Bako (the personal assistant) used to share this WhatsApp number and its owners' messages were
// forwarded to Bako's webhook. That link is cut (2026-10-10): nothing here may reach Bako again,
// even if the old BAKO_* variables are still set in the environment.

const payloadFrom = (from, text = 'הוצאה 50 קפה') =>
  JSON.stringify({
    object: 'whatsapp_business_account',
    entry: [{ changes: [{ value: { messages: [{ from, type: 'text', text: { body: text } }] } }] }]
  });

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

const post = async (raw, { secret = 'live-secret' } = {}) => {
  const req = Readable.from([Buffer.from(raw)]);
  req.method = 'POST';
  req.query = { secret };
  req.headers = { 'content-type': 'application/json', 'x-hub-signature-256': 'sha256=sig' };
  const res = { setHeader() {}, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; }, send(body) { this.body = body; return this; } };
  await webhook(req, res);
  return res;
};

test('the forwarding module is gone', () => {
  assert.equal(existsSync(new URL('../api/_lib/bakoForward.js', import.meta.url)), false);
});

test('an owner phone is no longer forwarded anywhere, even with the old env still set', async () => {
  const sent = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => { sent.push({ url, init }); return { ok: true, status: 200 }; };
  try {
    const res = await post(payloadFrom('972527075624'));
    assert.equal(res.code, 200);
    assert.notEqual(res.body?.forwarded, true);
    assert.equal(sent.filter((call) => String(call.url).includes('bako') || String(call.url).includes('money-indol')).length, 0);
  } finally { globalThis.fetch = realFetch; }
});

test('the webhook still enforces its secret', async () => {
  const wrong = await post(payloadFrom('972509999999'), { secret: 'nope' });
  assert.equal(wrong.code, 401);
});
