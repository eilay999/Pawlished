import { safeEqual } from './safeCompare.js';

// WHATSAPP_WEBHOOK_SECRET is the live secret. During a rotation, WHATSAPP_WEBHOOK_SECRET_NEXT is
// accepted too, so the URL in Meta can be switched without any downtime; afterwards NEXT is
// promoted to the main variable and removed.
export const getWebhookSecrets = (env = process.env) =>
  [env.WHATSAPP_WEBHOOK_SECRET, env.WHATSAPP_WEBHOOK_SECRET_NEXT].map((value) => String(value || '').trim()).filter(Boolean);

export const isWebhookSecretValid = (provided, secrets = getWebhookSecrets()) => {
  const candidate = String(provided || '');
  if (!candidate) return false;
  // Compare against every secret (no early exit) to keep timing independent of which one matched.
  return secrets.reduce((ok, secret) => safeEqual(candidate, secret) || ok, false);
};
