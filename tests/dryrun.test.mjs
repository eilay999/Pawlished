import test from 'node:test';
import assert from 'node:assert/strict';

test('dry run needs a local database', async () => {
  process.env.MESSAGING_DRY_RUN = 'true';
  process.env.SUPABASE_URL = 'https://abcdefghij.supabase.co';
  delete process.env.VERCEL_ENV;
  delete globalThis.__pawlishedDryRunInstalled;
  await assert.rejects(() => import('../api/_lib/dryRun.js?remote-db'), /local\/staging database/);
});

test('dry run intercepts provider calls and passes other requests through', async () => {
  process.env.MESSAGING_DRY_RUN = 'true';
  process.env.SUPABASE_URL = 'http://127.0.0.1:54321';
  delete process.env.VERCEL_ENV;
  delete globalThis.__pawlishedDryRunInstalled;
  const realFetch = globalThis.fetch;
  let passedThrough = 0;
  globalThis.fetch = async () => { passedThrough += 1; return new Response('real'); };
  try {
    await import('../api/_lib/dryRun.js?local-db');
    const fake = await globalThis.fetch('https://graph.facebook.com/v19.0/1/messages', { method: 'POST', body: '{"to":"1"}' });
    assert.equal(fake.status, 200);
    assert.equal(passedThrough, 0);
    const pay = await globalThis.fetch('https://secure.meshulam.co.il/api/light/server/1.0/createPaymentProcess', { method: 'POST' });
    assert.equal((await pay.json()).data.url, 'https://dry-run.invalid/pay');
    await globalThis.fetch('https://example.com/ok');
    assert.equal(passedThrough, 1);
  } finally {
    globalThis.fetch = realFetch;
    delete globalThis.__pawlishedDryRunInstalled;
    delete process.env.MESSAGING_DRY_RUN;
  }
});

test('dry run is ignored on Vercel production', async () => {
  process.env.MESSAGING_DRY_RUN = 'true';
  process.env.VERCEL_ENV = 'production';
  process.env.SUPABASE_URL = 'https://abcdefghij.supabase.co';
  delete globalThis.__pawlishedDryRunInstalled;
  const mod = await import('../api/_lib/dryRun.js?prod');
  assert.equal(mod.isDryRun, false);
  delete process.env.VERCEL_ENV;
  delete process.env.MESSAGING_DRY_RUN;
});
