// Local testing safety net. With MESSAGING_DRY_RUN=true, every outbound request to a messaging
// or payment provider (WhatsApp/Meta, Twilio, Grow/Meshulam, the invoice API) is logged and
// answered with a fake success instead of being sent. OTP codes show up in the local console.
//
// Safety rules:
//  - Ignored on Vercel production (VERCEL_ENV=production), so it can never silence production.
//  - In dry-run mode the database must be local (localhost / 127.0.0.1 / host.docker.internal)
//    or explicitly allowed via DRY_RUN_ALLOWED_DB_HOSTS, so a test run can't touch the real DB.

const enabled =
  String(process.env.MESSAGING_DRY_RUN || '').toLowerCase() === 'true' &&
  process.env.VERCEL_ENV !== 'production';

export const isDryRun = enabled;

const hostOf = (value = '') => {
  try {
    return new URL(value).hostname;
  } catch {
    return '';
  }
};

if (enabled && !globalThis.__pawlishedDryRunInstalled) {
  const dbHost = hostOf(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '');
  const allowedDbHosts = new Set([
    'localhost',
    '127.0.0.1',
    'host.docker.internal',
    ...String(process.env.DRY_RUN_ALLOWED_DB_HOSTS || '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean)
  ]);
  if (dbHost && !allowedDbHosts.has(dbHost)) {
    throw new Error(
      `MESSAGING_DRY_RUN is on but SUPABASE_URL points at ${dbHost}. ` +
        'Use a local/staging database, or add that host to DRY_RUN_ALLOWED_DB_HOSTS on purpose.'
    );
  }

  const blockedHosts = [
    'graph.facebook.com',
    'api.twilio.com',
    'secure.meshulam.co.il',
    'sandbox.meshulam.co.il',
    hostOf(process.env.INVOICE_API_URL || '')
  ].filter(Boolean);

  const realFetch = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input?.url || String(input);
    const host = hostOf(url);
    if (!blockedHosts.includes(host)) return realFetch(input, init);

    const body = typeof init.body === 'string' ? init.body.slice(0, 500) : '[form-data]';
    console.log(`[DRY RUN] ${init.method || 'GET'} ${url}\n          ${body}`);

    let payload = { ok: true, messages: [{ id: 'dry-run' }] };
    if (url.includes('createPaymentProcess')) {
      payload = { status: 1, data: { url: 'https://dry-run.invalid/pay' } };
    }
    return new Response(JSON.stringify(payload), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  globalThis.__pawlishedDryRunInstalled = true;
  console.log('[DRY RUN] outbound messaging/payment requests are disabled');
}
