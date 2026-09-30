import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeSupabase } from './fakeSupabase.mjs';

process.env.OTP_SECRET = 'a-long-test-secret-of-more-than-32-characters';
process.env.SUPABASE_URL = 'https://fake.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake';
process.env.BUSINESS_SCHEDULE_CACHE_TTL_SEC = '0';
for (const key of ['WHATSAPP_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID', 'TWILIO_ACCOUNT_SID']) delete process.env[key];

const fake = createFakeSupabase({
  customers: [
    { id: 'victim', name: 'דנה כהן', phone: '0501111111', pet_name: 'לאקי', pet_type: 'כלב', notes: 'סודי', default_price: 240, visit_frequency_weeks: 6, lifecycle_status: 'ACTIVE' }
  ],
  appointments: [],
  whatsapp_reminders: [],
  business_schedule: []
});
mock.module('@supabase/supabase-js', { namedExports: { createClient: () => fake.client } });

const { createOtpSessionToken } = await import('../api/_lib/otpSession.js');
const { getAllowedSlotsForLocalDate, buildSlotDateFromLocal } = await import('../api/_lib/appointments.js');
const createBooking = (await import('../api/public-booking/create.js')).default;
const createCustomer = (await import('../api/public-booking/create-customer.js')).default;

const call = async (handler, token, body) => {
  const res = { headers: {}, setHeader() {}, status(code) { this.code = code; return this; }, json(payload) { this.body = payload; return this; } };
  await handler({ method: 'POST', headers: { 'x-otp-token': token }, body }, res);
  return res;
};

// Next working slots (Israel time), so the test does not depend on today's weekday.
const freeSlots = [];
for (let offset = 2; offset < 25 && freeSlots.length < 6; offset += 1) {
  const day = new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
  // One slot per day: appointments last hours, so slots on the same day overlap.
  const times = getAllowedSlotsForLocalDate(day, 'Asia/Jerusalem');
  if (times.length > 0) freeSlots.push({ date: day, time: times[0] });
}

test('a different phone using a customer\'s name cannot attach to or read their record', async () => {
  const attacker = createOtpSessionToken('0502222222');
  const slot = freeSlots[0];
  const res = await call(createBooking, attacker, {
    ...slot,
    customer: { name: 'דנה כהן', petName: 'לאקי', petType: 'כלב' },
    price: 1,
    service: 'חינם',
    visitFrequencyWeeks: 1
  });
  assert.equal(res.code, 200, JSON.stringify(res.body));
  assert.equal(res.body.createdCustomer, true, 'must create a new customer for the new phone');
  assert.deepEqual(Object.keys(res.body.customer).sort(), ['name', 'petName', 'petType']);
  assert.ok(!JSON.stringify(res.body).includes('סודי'));
  assert.ok(!JSON.stringify(res.body).includes('0501111111'));

  const appt = fake.db.appointments.at(-1);
  assert.notEqual(appt.customer_id, 'victim');
  assert.notEqual(Number(appt.price), 1, 'client price must be ignored');
  assert.equal(appt.service, 'תספורת', 'client service must be ignored');
});

test('the same verified phone books onto its own customer record', async () => {
  const owner = createOtpSessionToken('0501111111');
  const res = await call(createBooking, owner, { ...freeSlots[1], customer: { name: 'whatever', petName: 'x', petType: 'כלב' } });
  assert.equal(res.code, 200, JSON.stringify(res.body));
  assert.equal(res.body.createdCustomer, false);
  assert.equal(fake.db.appointments.at(-1).customer_id, 'victim');
  assert.equal(Number(fake.db.appointments.at(-1).price), 240, 'price comes from the business-set default');
});

test('a phone cannot hold more than 3 upcoming appointments', async () => {
  const owner = createOtpSessionToken('0501111111');
  assert.equal((await call(createBooking, owner, { ...freeSlots[2] })).code, 200);
  assert.equal((await call(createBooking, owner, { ...freeSlots[3] })).code, 200);
  const res = await call(createBooking, owner, { ...freeSlots[4] });
  assert.equal(res.code, 429, JSON.stringify(res.body));
  assert.equal(fake.db.appointments.filter((a) => a.customer_id === 'victim').length, 3);
});

test('creating a customer card with someone else\'s name does not leak or collide', async () => {
  const stranger = createOtpSessionToken('0503333333');
  const res = await call(createCustomer, stranger, { customer: { name: 'דנה כהן', petName: 'לאקי', petType: 'כלב' } });
  assert.equal(res.code, 200, JSON.stringify(res.body));
  assert.deepEqual(Object.keys(res.body.customer).sort(), ['name', 'petName', 'petType']);
});

test('requests without a verified phone are rejected', async () => {
  const res = await call(createBooking, '', { ...freeSlots[5] });
  assert.equal(res.code, 401);
});
