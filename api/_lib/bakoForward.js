// Meta allows ONE webhook URL per app and it points at Pawlished, but the personal assistant
// "Bako" shares the same WhatsApp number. Messages from the owners' phones listed in
// BAKO_FORWARD_PHONES are therefore handed on to Bako's webhook instead of being handled here;
// everything else stays with Pawlished. (Owner-approved: Ilay's and Agam's phones only.)
//
// The ORIGINAL bytes and Meta's original X-Hub-Signature-256 are forwarded untouched, so the
// receiver can verify the message exactly as if Meta had sent it. When BAKO_FORWARD_SECRET is set
// it is sent as an extra header too. Inert unless BAKO_FORWARD_PHONES is set.

const digits = (value) => String(value || '').replace(/\D/g, '');

// Israeli numbers as WhatsApp reports them: 972XXXXXXXXX (no plus, no leading zero).
export const normalizeForwardPhone = (value) => {
  let d = digits(value);
  if (d.startsWith('00')) d = d.slice(2);
  if (d.startsWith('0')) d = `972${d.slice(1)}`;
  return d;
};

export const parseForwardPhones = (raw) =>
  new Set(String(raw || '').split(',').map(normalizeForwardPhone).filter((d) => d.length >= 11));

// True when any message in a Meta payload comes from a phone that belongs to Bako.
export const hasBakoSender = (body, phones) => {
  if (!phones || phones.size === 0) return false;
  const entries = Array.isArray(body?.entry) ? body.entry : [];
  return entries.some((entry) =>
    (Array.isArray(entry?.changes) ? entry.changes : []).some((change) =>
      (Array.isArray(change?.value?.messages) ? change.value.messages : []).some((message) =>
        phones.has(normalizeForwardPhone(message?.from))
      )
    )
  );
};

export const forwardToBako = async ({
  raw,
  signature,
  url = process.env.BAKO_WEBHOOK_URL || 'https://money-indol-nu.vercel.app/api/webhook',
  secret = process.env.BAKO_FORWARD_SECRET,
  fetchImpl = fetch,
  timeoutMs = 8000
}) => {
  const headers = { 'Content-Type': 'application/json' };
  if (signature) headers['X-Hub-Signature-256'] = signature;
  if (secret) headers['X-Bako-Forward-Secret'] = String(secret).trim();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(String(url).trim(), { method: 'POST', headers, body: raw, signal: controller.signal });
    return { ok: response.ok, status: response.status };
  } catch (error) {
    return { ok: false, status: 0, error: error?.name === 'AbortError' ? 'timeout' : 'network' };
  } finally {
    clearTimeout(timer);
  }
};
