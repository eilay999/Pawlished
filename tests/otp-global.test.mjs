import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeSupabase } from './fakeSupabase.mjs';

process.env.OTP_SECRET = 'a-long-test-secret-of-more-than-32-characters';
process.env.SUPABASE_URL = 'https://fake.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake';
process.env.OTP_MAX_10MIN_GLOBAL = '3';
process.env.OTP_COOLDOWN_SEC = '0';
process.env.ADMIN_PHONES = '0527075624';
process.env.MESSAGING_DRY_RUN = 'true';
process.env.SUPABASE_URL = 'http://127.0.0.1:54321';
process.env.WHATSAPP_TOKEN = 't';
process.env.WHATSAPP_PHONE_NUMBER_ID = '1';
delete process.env.VERCEL_ENV;

const fake = createFakeSupabase({ wa_otp: [] });
mock.module('@supabase/supabase-js', { namedExports: { createClient: () => fake.client } });
const handler = (await import('../api/whatsapp-otp.js')).default;

const send = async (phone, ip = '1.1.1.1') => {
  const res = { setHeader() {}, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
  await handler({ method: 'POST', headers: { 'x-real-ip': ip }, body: { action: 'send', phone } }, res);
  return res;
};

test('global OTP circuit breaker stops a distributed flood but never the admin', async () => {
  for (let i = 0; i < 3; i += 1) {
    const ok = await send(`05000000${10 + i}`, `9.9.9.${i}`);
    assert.equal(ok.code, 200, JSON.stringify(ok.body));
  }
  const blocked = await send('0500000099', '9.9.9.99');
  assert.equal(blocked.code, 429);
  const admin = await send('0527075624', '8.8.8.8');
  assert.equal(admin.code, 200, JSON.stringify(admin.body));
});
