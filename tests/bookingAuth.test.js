import assert from 'node:assert/strict';
import test from 'node:test';

process.env.OTP_SECRET = 'test-only-secret-with-more-than-24-characters';

const { createBookingToken, verifyBookingToken } = await import(
  '../api/_lib/bookingAuth.js'
);

test('creates and verifies a phone-bound booking token', () => {
  const token = createBookingToken('050-1234567', 1_000);
  const claims = verifyBookingToken(token, '0501234567', 1_100);
  assert.equal(claims?.sub, '0501234567');
});

test('rejects a token used for another phone', () => {
  const token = createBookingToken('0501234567', 1_000);
  assert.equal(verifyBookingToken(token, '0527654321', 1_100), null);
});

test('rejects expired and tampered tokens', () => {
  const token = createBookingToken('0501234567', 1_000);
  assert.equal(verifyBookingToken(token, '0501234567', 3_000), null);
  assert.equal(verifyBookingToken(`${token}x`, '0501234567', 1_100), null);
});
