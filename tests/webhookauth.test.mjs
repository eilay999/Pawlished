import test from 'node:test';
import assert from 'node:assert/strict';
import { getWebhookSecrets, isWebhookSecretValid } from '../api/_lib/webhookAuth.js';

test('both the live and the next secret are accepted during rotation, nothing else', () => {
  const secrets = getWebhookSecrets({ WHATSAPP_WEBHOOK_SECRET: ' old-secret ', WHATSAPP_WEBHOOK_SECRET_NEXT: 'new-secret' });
  assert.deepEqual(secrets, ['old-secret', 'new-secret']);
  assert.equal(isWebhookSecretValid('old-secret', secrets), true);
  assert.equal(isWebhookSecretValid('new-secret', secrets), true);
  assert.equal(isWebhookSecretValid('other', secrets), false);
  assert.equal(isWebhookSecretValid('', secrets), false);
  assert.equal(isWebhookSecretValid(undefined, secrets), false);
});

test('without a next secret only the live one works', () => {
  const secrets = getWebhookSecrets({ WHATSAPP_WEBHOOK_SECRET: 'only' });
  assert.deepEqual(secrets, ['only']);
  assert.equal(isWebhookSecretValid('only', secrets), true);
  assert.deepEqual(getWebhookSecrets({}), []);
});
