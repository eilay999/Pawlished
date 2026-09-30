import test from 'node:test';
import assert from 'node:assert/strict';

process.env.GROW_NOTIFY_SECRET = 'test-secret-test-secret-test-secret';
process.env.GROW_USER_ID = 'u';
process.env.GROW_PAGE_CODE = 'p';
process.env.PUBLIC_BASE_URL = 'https://example.co.il';
const grow = await import('../api/_lib/grow.js');

test('notify token verifies only for the same appointment and kind', () => {
  const token = grow.signNotifyToken('appt-1', 'DEPOSIT');
  assert.equal(grow.verifyNotifyToken('appt-1', 'DEPOSIT', token), true);
  assert.equal(grow.verifyNotifyToken('appt-2', 'DEPOSIT', token), false);
  assert.equal(grow.verifyNotifyToken('appt-1', 'BALANCE', token), false);
  assert.equal(grow.verifyNotifyToken('appt-1', 'DEPOSIT', ''), false);
});

test('grow is configured only with https public url', () => {
  assert.equal(grow.isGrowConfigured(), true);
});

test('callback parser handles flat and nested payloads', () => {
  assert.deepEqual(grow.parseGrowCallback({ transactionId: '7', paymentSum: '50.00' }), { transactionId: '7', paymentSum: 50 });
  assert.deepEqual(grow.parseGrowCallback({ data: { transactionCode: 'T1', paymentSum: 50 } }), { transactionId: 'T1', paymentSum: 50 });
  assert.deepEqual(grow.parseGrowCallback({}), { transactionId: '', paymentSum: 0 });
});
