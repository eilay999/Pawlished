import test from 'node:test';
import assert from 'node:assert/strict';

process.env.OTP_SECRET = 'a-long-test-secret-of-more-than-32-characters';
process.env.OTP_SESSION_TTL_MIN = '20';
process.env.ADMIN_PHONES = '0501234567';
const session = await import('../api/_lib/otpSession.js');
const admin = await import('../api/_lib/adminAuth.js');

test('default session lasts 20 minutes', () => {
  const token = session.createOtpSessionToken('0501234567');
  const { expiresAt } = session.verifyOtpSessionToken(token);
  const minutes = (expiresAt - Date.now()) / 60000;
  assert.ok(minutes > 19 && minutes <= 20, String(minutes));
});

test('extended session lasts as requested and still verifies', () => {
  const token = session.createOtpSessionToken('0501234567', 30 * 24 * 60);
  const { expiresAt } = session.verifyOtpSessionToken(token);
  const days = (expiresAt - Date.now()) / 86400000;
  assert.ok(days > 29.9 && days <= 30, String(days));
});

test('only admin phones are recognised for the extended session', () => {
  assert.equal(admin.isAdminPhone('+972501234567'), true);
  assert.equal(admin.isAdminPhone('0509999999'), false);
  assert.equal(admin.isAdminPhone(''), false);
});

test('a tampered token is rejected', () => {
  const token = session.createOtpSessionToken('0501234567', 60);
  const [payload, signature] = token.split('.');
  const forged = Buffer.from(JSON.stringify({ v: 1, phone: '972509999999', exp: Date.now() + 1e9 })).toString('base64url');
  assert.throws(() => session.verifyOtpSessionToken(`${forged}.${signature}`), /Invalid/);
  assert.ok(payload);
});
