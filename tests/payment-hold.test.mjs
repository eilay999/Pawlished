import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeSupabase } from './fakeSupabase.mjs';

process.env.OTP_SECRET = 'a-long-test-secret-of-more-than-32-characters';
process.env.SUPABASE_URL = 'https://fake.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake';
process.env.BUSINESS_SCHEDULE_CACHE_TTL_SEC = '0';
process.env.ADMIN_PHONES = '0527075624';
process.env.GROW_USER_ID = 'user';
process.env.GROW_PAGE_CODE = 'page';
process.env.GROW_NOTIFY_SECRET = 'notify-secret-for-tests';
process.env.PUBLIC_BASE_URL = 'https://pawlished.test';
process.env.PAYMENT_HOLD_MINUTES = '30';
for (const key of ['WHATSAPP_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID', 'TWILIO_ACCOUNT_SID']) delete process.env[key];

let growFails = false;
const growCalls = [];
globalThis.fetch = async (url, init = {}) => {
  const target = String(url);
  growCalls.push(target);
  if (target.includes('createPaymentProcess')) {
    if (growFails) return new Response('boom', { status: 500 });
    return new Response(JSON.stringify({ data: { url: `https://pay.test/${growCalls.length}` } }), { status: 200 });
  }
  if (target.includes('approveTransaction')) return new Response('{}', { status: 200 });
  return new Response('unexpected', { status: 500 });
};

const fake = createFakeSupabase({
  customers: [
    { id: 'owner', name: 'נועה לוי', phone: '0504444444', pet_name: 'בובי', pet_type: 'מלטז', default_price: 240, visit_frequency_weeks: 6, lifecycle_status: 'ACTIVE' }
  ],
  dogs: [{ id: '11111111-1111-4111-8111-111111111111', customer_id: 'owner', name: 'בובי', breed: 'מלטז' }],
  appointments: [],
  whatsapp_reminders: [],
  business_schedule: []
});
mock.module('@supabase/supabase-js', { namedExports: { createClient: () => fake.client } });

const { createOtpSessionToken } = await import('../api/_lib/otpSession.js');
const { getAllowedSlotsForLocalDate } = await import('../api/_lib/appointments.js');
const { signNotifyToken } = await import('../api/_lib/grow.js');
const handleGrowWebhook = (await import('../api/_lib/growWebhook.js')).default;
const createBooking = (await import('../api/public-booking/create.js')).default;
const availability = (await import('../api/public-booking/availability.js')).default;
const profile = (await import('../api/public-booking/customer-exists.js')).default;

const respond = () => ({ headers: {}, setHeader() {}, status(code) { this.code = code; return this; }, json(payload) { this.body = payload; return this; } });
const post = async (handler, token, body) => {
  const res = respond();
  await handler({ method: 'POST', headers: { 'x-otp-token': token, 'x-real-ip': '7.7.7.7' }, body }, res);
  return res;
};
const getAvailability = async () => {
  const res = respond();
  await availability({ method: 'GET', query: { days: '25' }, headers: {} }, res);
  return res.body.days;
};
const payWebhook = async (appointmentId, sum = 50) => {
  const res = respond();
  await handleGrowWebhook({
    method: 'POST',
    query: { a: appointmentId, k: 'DEPOSIT', t: signNotifyToken(appointmentId, 'DEPOSIT') },
    body: { data: { transactionId: `tx-${Math.random()}`, paymentSum: String(sum) } }
  }, res);
  return res;
};

const slots = [];
for (let offset = 2; offset < 25 && slots.length < 12; offset += 1) {
  const day = new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
  const times = getAllowedSlotsForLocalDate(day, 'Asia/Jerusalem');
  if (times.length > 0) slots.push({ date: day, time: times[0] });
}
const isOpen = (days, { date, time }) => days.find((d) => d.date === date)?.times.find((t) => t.time === time)?.available;

const owner = () => createOtpSessionToken('0504444444');
const rowOf = (id) => fake.db.appointments.find((row) => row.id === id);

test('an online booking is held, not confirmed, and the response carries the payment link', async () => {
  const res = await post(createBooking, owner(), { ...slots[0], dogId: '11111111-1111-4111-8111-111111111111' });
  assert.equal(res.code, 200, JSON.stringify(res.body));
  assert.equal(res.body.appointment.status, 'PENDING_PAYMENT');
  assert.match(res.body.payment.url, /^https:\/\/pay\.test\//);
  assert.equal(res.body.payment.amount, 50);
  const minutesLeft = (new Date(res.body.payment.expiresAt) - Date.now()) / 60000;
  assert.ok(minutesLeft > 29 && minutesLeft <= 30, `hold lasts 30 minutes, got ${minutesLeft}`);
  assert.equal(res.body.confirmation, undefined, 'no confirmation until it is paid');
  assert.equal(fake.db.whatsapp_reminders.length, 0, 'no reminder for an unpaid hold');
  assert.equal(rowOf(res.body.appointment.id).status, 'PENDING_PAYMENT');
});

test('a held slot is unavailable to everyone else', async () => {
  assert.equal(isOpen(await getAvailability(), slots[0]), false);
  const other = await post(createBooking, createOtpSessionToken('0509999999'), {
    ...slots[0],
    customer: { name: 'דנה', petName: 'לאקי', petType: 'כלב' }
  });
  assert.equal(other.code, 409, JSON.stringify(other.body));
});

test('paying confirms the booking, schedules the reminder once, and a repeated callback changes nothing', async () => {
  const id = fake.db.appointments[0].id;
  assert.equal((await payWebhook(id)).code, 200);
  assert.equal(rowOf(id).status, 'SCHEDULED');
  assert.ok(rowOf(id).deposit_paid_at);
  assert.equal(fake.db.whatsapp_reminders.filter((r) => r.source_id === id).length, 1);

  assert.equal((await payWebhook(id)).code, 200);
  assert.equal(rowOf(id).status, 'SCHEDULED');
  assert.equal(fake.db.whatsapp_reminders.filter((r) => r.source_id === id).length, 1, 'no duplicate reminder');
});

test('a wrong signature or a too-small payment never confirms anything', async () => {
  const held = await post(createBooking, owner(), { ...slots[1], dogId: '11111111-1111-4111-8111-111111111111' });
  const id = held.body.appointment.id;

  const forged = respond();
  await handleGrowWebhook({ method: 'POST', query: { a: id, k: 'DEPOSIT', t: 'x'.repeat(64) }, body: { transactionId: 't', paymentSum: 50 } }, forged);
  assert.equal(forged.code, 401);

  assert.equal((await payWebhook(id, 10)).code, 400);
  assert.equal(rowOf(id).status, 'PENDING_PAYMENT');
});

test('an unpaid hold frees the slot after 30 minutes and someone else can take it', async () => {
  const id = fake.db.appointments.find((row) => row.status === 'PENDING_PAYMENT').id;
  const slot = slots[1];
  assert.equal(isOpen(await getAvailability(), slot), false);

  mock.timers.enable({ apis: ['Date'], now: Date.now() });
  try {
    mock.timers.setTime(Date.now() + 29 * 60000);
    assert.equal(isOpen(await getAvailability(), slot), false, 'still held at 29 minutes');

    mock.timers.setTime(Date.now() + 2 * 60000);
    assert.equal(isOpen(await getAvailability(), slot), true, 'released after 30 minutes');
    assert.equal(rowOf(id).status, 'EXPIRED');

    const taken = await post(createBooking, createOtpSessionToken('0509999999'), {
      ...slot,
      customer: { name: 'דנה', petName: 'לאקי', petType: 'כלב' }
    });
    assert.equal(taken.code, 200, JSON.stringify(taken.body));
    assert.equal(taken.body.appointment.status, 'PENDING_PAYMENT');
  } finally {
    mock.timers.reset();
  }
});

test('late payment: slot still free -> reinstated; slot taken meanwhile -> kept as cancelled for a refund', async () => {
  // slots[2]: hold, let it expire, nobody takes it, then pay.
  const held = await post(createBooking, owner(), { ...slots[2], dogId: '11111111-1111-4111-8111-111111111111' });
  const freeId = held.body.appointment.id;
  mock.timers.enable({ apis: ['Date'], now: Date.now() });
  try {
    mock.timers.setTime(Date.now() + 31 * 60000);
    assert.equal(isOpen(await getAvailability(), slots[2]), true);
    assert.equal(rowOf(freeId).status, 'EXPIRED');
    assert.equal((await payWebhook(freeId)).code, 200);
    assert.equal(rowOf(freeId).status, 'SCHEDULED', 'reinstated');
  } finally {
    mock.timers.reset();
  }

  // slots[3]: hold, expire, somebody else holds it, then the first one pays.
  const first = await post(createBooking, owner(), { ...slots[3], dogId: '11111111-1111-4111-8111-111111111111' });
  const lateId = first.body.appointment.id;
  mock.timers.enable({ apis: ['Date'], now: Date.now() });
  try {
    mock.timers.setTime(Date.now() + 31 * 60000);
    const second = await post(createBooking, createOtpSessionToken('0508888888'), {
      ...slots[3],
      customer: { name: 'רוני', petName: 'טופי', petType: 'כלב' }
    });
    assert.equal(second.code, 200, JSON.stringify(second.body));
    assert.equal((await payWebhook(lateId)).code, 200);
    assert.equal(rowOf(lateId).status, 'CANCELLED');
    assert.ok(rowOf(lateId).deposit_paid_at, 'the payment is on record so it can be refunded');
    assert.match(rowOf(lateId).notes, /החזר/);
    assert.equal(rowOf(second.body.appointment.id).status, 'PENDING_PAYMENT', 'the new holder is untouched');
  } finally {
    mock.timers.reset();
  }
});

test('pay-link gives the owner a fresh link while the hold lives, and nobody else', async () => {
  const held = await post(createBooking, owner(), { ...slots[4], dogId: '11111111-1111-4111-8111-111111111111' });
  const id = held.body.appointment.id;

  const again = await post(createBooking, owner(), { action: 'pay-link', appointmentId: id });
  assert.equal(again.code, 200, JSON.stringify(again.body));
  assert.match(again.body.payment.url, /^https:\/\/pay\.test\//);
  assert.equal(
    new Date(again.body.payment.expiresAt).getTime(),
    new Date(held.body.payment.expiresAt).getTime(),
    'asking for a new link must not extend the hold'
  );

  const stranger = await post(createBooking, createOtpSessionToken('0507777777'), { action: 'pay-link', appointmentId: id });
  assert.equal(stranger.code, 404);

  mock.timers.enable({ apis: ['Date'], now: Date.now() });
  try {
    mock.timers.setTime(Date.now() + 31 * 60000);
    const late = await post(createBooking, owner(), { action: 'pay-link', appointmentId: id });
    assert.equal(late.code, 409);
  } finally {
    mock.timers.reset();
  }
});

test('the profile shows a held booking with its expiry, and a confirmed one without', async () => {
  const held = await post(createBooking, owner(), { ...slots[5], dogId: '11111111-1111-4111-8111-111111111111' });
  const listed = await post(profile, owner(), {});
  const pending = listed.body.upcomingAppointments.find((a) => a.id === held.body.appointment.id);
  assert.equal(pending.status, 'PENDING_PAYMENT');
  assert.equal(pending.holdExpiresAt, held.body.payment.expiresAt);

  await payWebhook(held.body.appointment.id);
  const after = await post(profile, owner(), {});
  const confirmed = after.body.upcomingAppointments.find((a) => a.id === held.body.appointment.id);
  assert.equal(confirmed.status, 'SCHEDULED');
  assert.equal(confirmed.holdExpiresAt, null);
});

test('held bookings count toward the 3-upcoming-appointments cap', async () => {
  const phone = createOtpSessionToken('0506666666');
  for (const slot of slots.slice(8, 11)) {
    const ok = await post(createBooking, phone, { ...slot, customer: { name: 'שי', petName: 'רקס', petType: 'כלב' } });
    assert.equal(ok.code, 200, JSON.stringify(ok.body));
  }
  // three held slots already count; a fourth must be refused
  const fourth = await post(createBooking, phone, { ...slots[11], customer: { name: 'שי', petName: 'רקס', petType: 'כלב' } });
  assert.equal(fourth.code, 429, JSON.stringify(fourth.body));
});

test('if the payment link cannot be created the slot is not kept', async () => {
  const day = new Date(Date.now() + 26 * 86400000).toISOString().slice(0, 10);
  const time = getAllowedSlotsForLocalDate(day, 'Asia/Jerusalem')[0] || getAllowedSlotsForLocalDate(
    new Date(Date.now() + 27 * 86400000).toISOString().slice(0, 10), 'Asia/Jerusalem')[0];
  assert.ok(time);
  growFails = true;
  try {
    const before = fake.db.appointments.length;
    const res = await post(createBooking, createOtpSessionToken('0505555555'), {
      date: getAllowedSlotsForLocalDate(day, 'Asia/Jerusalem').length ? day : new Date(Date.now() + 27 * 86400000).toISOString().slice(0, 10),
      time,
      customer: { name: 'מיכל', petName: 'צ׳ילי', petType: 'פודל' }
    });
    assert.equal(res.code, 502, JSON.stringify(res.body));
    assert.equal(fake.db.appointments.length, before + 1);
    assert.equal(fake.db.appointments.at(-1).status, 'EXPIRED', 'released immediately');
  } finally {
    growFails = false;
  }
});
