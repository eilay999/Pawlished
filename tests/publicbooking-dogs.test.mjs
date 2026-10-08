import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import { createFakeSupabase } from './fakeSupabase.mjs';

process.env.OTP_SECRET = 'a-long-test-secret-of-more-than-32-characters';
process.env.SUPABASE_URL = 'https://fake.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake';
process.env.BUSINESS_SCHEDULE_CACHE_TTL_SEC = '0';
process.env.ADMIN_PHONES = '0527075624';
for (const key of ['WHATSAPP_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID', 'TWILIO_ACCOUNT_SID']) delete process.env[key];

const DOG_BOBI = '11111111-1111-4111-8111-111111111111';
const DOG_LUNA = '22222222-2222-4222-8222-222222222222';
const DOG_OTHERS = '33333333-3333-4333-8333-333333333333';

const fake = createFakeSupabase({
  customers: [
    { id: 'owner', name: 'נועה לוי', phone: '0504444444', pet_name: 'בובי', pet_type: 'מלטז', default_price: 240, visit_frequency_weeks: 6, lifecycle_status: 'ACTIVE' },
    { id: 'other', name: 'דנה כהן', phone: '0501111111', pet_name: 'לאקי', pet_type: 'פודל', default_price: 240, visit_frequency_weeks: 6, lifecycle_status: 'ACTIVE' }
  ],
  dogs: [
    { id: DOG_BOBI, customer_id: 'owner', name: 'בובי', breed: 'מלטז' },
    { id: DOG_LUNA, customer_id: 'owner', name: 'לונה', breed: 'שיצו' },
    { id: DOG_OTHERS, customer_id: 'other', name: 'לאקי', breed: 'פודל' }
  ],
  appointments: [],
  whatsapp_reminders: [],
  business_schedule: [],
  wa_otp: []
});
mock.module('@supabase/supabase-js', { namedExports: { createClient: () => fake.client } });

const { createOtpSessionToken, verifyOtpSessionToken, createDeviceToken, verifyDeviceToken } = await import('../api/_lib/otpSession.js');
const { getAllowedSlotsForLocalDate } = await import('../api/_lib/appointments.js');
const createBooking = (await import('../api/public-booking/create.js')).default;
const customerCard = (await import('../api/public-booking/create-customer.js')).default;
const profile = (await import('../api/public-booking/customer-exists.js')).default;
const otp = (await import('../api/whatsapp-otp.js')).default;

const call = async (handler, token, body) => {
  const res = { headers: {}, setHeader() {}, status(code) { this.code = code; return this; }, json(payload) { this.body = payload; return this; } };
  await handler({ method: 'POST', headers: { 'x-otp-token': token, 'x-real-ip': '7.7.7.7' }, body }, res);
  return res;
};

const freeSlots = [];
for (let offset = 2; offset < 25 && freeSlots.length < 6; offset += 1) {
  const day = new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
  const times = getAllowedSlotsForLocalDate(day, 'Asia/Jerusalem');
  if (times.length > 0) freeSlots.push({ date: day, time: times[0] });
}

const owner = () => createOtpSessionToken('0504444444');

/* ---------- remembered device ---------- */

test('a device token and a session token can never stand in for one another', () => {
  const session = createOtpSessionToken('0504444444');
  const device = createDeviceToken('0504444444');
  assert.equal(verifyDeviceToken(device).phone, '972504444444');
  assert.equal(verifyOtpSessionToken(session).phone, '972504444444');
  assert.throws(() => verifyOtpSessionToken(device), /verification token/i);
  assert.throws(() => verifyDeviceToken(session), /device token/i);
  assert.throws(() => verifyDeviceToken(`${device.slice(0, -4)}AAAA`), /device token/i);
  assert.throws(() => verifyDeviceToken(''), /device token/i);
});

test('a device token expires after its lifetime', () => {
  mock.timers.enable({ apis: ['Date'], now: Date.now() });
  try {
    const device = createDeviceToken('0504444444');
    mock.timers.setTime(Date.now() + 59 * 86400000);
    assert.equal(verifyDeviceToken(device).phone, '972504444444');
    mock.timers.setTime(Date.now() + 3 * 86400000);
    assert.throws(() => verifyDeviceToken(device), /expired/i);
  } finally {
    mock.timers.reset();
  }
});

const otpCall = async (body) => {
  const res = { setHeader() {}, status(code) { this.code = code; return this; }, json(payload) { this.body = payload; return this; } };
  await otp({ method: 'POST', headers: { 'x-real-ip': '7.7.7.7' }, body }, res);
  return res;
};

const seedCode = (phone, code) =>
  fake.db.wa_otp.push({
    id: crypto.randomUUID(),
    phone,
    code_hash: crypto.createHash('sha256').update(`${code}:${process.env.OTP_SECRET}`).digest('hex'),
    expires_at: new Date(Date.now() + 600000).toISOString(),
    used_at: null,
    attempts: 0,
    created_at: new Date().toISOString()
  });

test('verifying with "remember" gives customers a device token, and resume swaps it for a fresh session', async () => {
  seedCode('972504444444', '123456');
  const verified = await otpCall({ action: 'verify', phone: '0504444444', code: '123456', remember: true });
  assert.equal(verified.code, 200, JSON.stringify(verified.body));
  assert.ok(verified.body.deviceToken, 'customer asked to be remembered');

  const resumed = await otpCall({ action: 'resume', deviceToken: verified.body.deviceToken });
  assert.equal(resumed.code, 200, JSON.stringify(resumed.body));
  assert.equal(verifyOtpSessionToken(resumed.body.sessionToken).phone, '972504444444');
});

test('without "remember" no device token is issued', async () => {
  seedCode('972504444444', '654321');
  const verified = await otpCall({ action: 'verify', phone: '0504444444', code: '654321' });
  assert.equal(verified.code, 200);
  assert.equal(verified.body.deviceToken, undefined);
});

test('admin phones never get a device token and cannot resume with one', async () => {
  seedCode('972527075624', '111111');
  const verified = await otpCall({ action: 'verify', phone: '0527075624', code: '111111', remember: true });
  assert.equal(verified.code, 200, JSON.stringify(verified.body));
  assert.equal(verified.body.deviceToken, undefined, 'admin access uses the dedicated admin session instead');

  const forged = createDeviceToken('0527075624');
  const resumed = await otpCall({ action: 'resume', deviceToken: forged });
  assert.equal(resumed.code, 401);
});

test('resume rejects garbage', async () => {
  assert.equal((await otpCall({ action: 'resume', deviceToken: 'nope' })).code, 401);
  assert.equal((await otpCall({ action: 'resume' })).code, 401);
});

/* ---------- dogs on the booking ---------- */

test('profile returns only the verified phone\'s own dogs', async () => {
  const mine = await call(profile, owner(), {});
  assert.equal(mine.code, 200, JSON.stringify(mine.body));
  assert.deepEqual(mine.body.dogs.map((dog) => dog.name).sort(), ['בובי', 'לונה']);
  assert.ok(!JSON.stringify(mine.body).includes('דנה'));

  const stranger = await call(profile, createOtpSessionToken('0509999999'), {});
  assert.equal(stranger.body.exists, false);
  assert.deepEqual(stranger.body.dogs, []);
});

test('booking stores the chosen dog and the profile then lists the appointment with its name', async () => {
  const res = await call(createBooking, owner(), { ...freeSlots[0], dogId: DOG_LUNA });
  assert.equal(res.code, 200, JSON.stringify(res.body));
  assert.deepEqual(res.body.dog, { id: DOG_LUNA, name: 'לונה' });
  assert.equal(fake.db.appointments.at(-1).dog_id, DOG_LUNA);

  const listed = await call(profile, owner(), {});
  assert.equal(listed.body.upcomingAppointments.length, 1);
  assert.equal(listed.body.upcomingAppointments[0].dogName, 'לונה');
});

test('a dog from another customer cannot be booked, and nothing is created', async () => {
  const before = fake.db.appointments.length;
  const res = await call(createBooking, owner(), { ...freeSlots[1], dogId: DOG_OTHERS });
  assert.equal(res.code, 404, JSON.stringify(res.body));
  assert.equal(fake.db.appointments.length, before);
});

test('a malformed dog id is ignored instead of reaching the database', async () => {
  const res = await call(createBooking, owner(), { ...freeSlots[2], dogId: "x' or 1=1 --" });
  assert.equal(res.code, 200, JSON.stringify(res.body));
  assert.equal(fake.db.appointments.at(-1).dog_id, null);
});

test('a new customer gets a customer row, a dog row and the dog on the appointment', async () => {
  const res = await call(createBooking, createOtpSessionToken('0505555555'), {
    ...freeSlots[3],
    customer: { name: 'מיכל', petName: 'צ׳ילי', petType: 'פודל טוי' },
    newDog: { name: 'צ׳ילי', breed: 'פודל טוי', sex: 'female', allergies: '', notes: 'קצת ביישן' }
  });
  assert.equal(res.code, 200, JSON.stringify(res.body));
  assert.equal(res.body.createdCustomer, true);
  const dog = fake.db.dogs.find((row) => row.name === 'צ׳ילי');
  assert.ok(dog, 'dog row created');
  assert.equal(dog.sex, 'FEMALE');
  assert.equal(dog.notes, 'קצת ביישן');
  assert.equal(fake.db.appointments.at(-1).dog_id, dog.id);
  assert.equal(dog.customer_id, fake.db.appointments.at(-1).customer_id);
});

/* ---------- editing dogs ---------- */

test('add-dog and update-dog only touch the verified phone\'s own card', async () => {
  const added = await call(customerCard, owner(), { action: 'add-dog', dog: { name: 'טופי', breed: 'יורקשייר', sex: 'MALE' } });
  assert.equal(added.code, 200, JSON.stringify(added.body));
  assert.equal(fake.db.dogs.find((d) => d.name === 'טופי').customer_id, 'owner');

  const edited = await call(customerCard, owner(), { action: 'update-dog', dogId: DOG_BOBI, dog: { name: 'בובי הקטן', breed: 'מלטז' } });
  assert.equal(edited.code, 200, JSON.stringify(edited.body));
  assert.equal(fake.db.dogs.find((d) => d.id === DOG_BOBI).name, 'בובי הקטן');

  const theft = await call(customerCard, owner(), { action: 'update-dog', dogId: DOG_OTHERS, dog: { name: 'נחטף' } });
  assert.equal(theft.code, 404);
  assert.equal(fake.db.dogs.find((d) => d.id === DOG_OTHERS).name, 'לאקי');

  const bad = await call(customerCard, owner(), { action: 'update-dog', dogId: 'not-a-uuid', dog: { name: 'x' } });
  assert.equal(bad.code, 400);
});

test('dog input is bounded and cleaned', async () => {
  const res = await call(customerCard, owner(), {
    action: 'add-dog',
    dog: { name: `${'א'.repeat(200)}`, breed: 'פודל', sex: 'robot', notes: 'שורה\u0000חדשה' }
  });
  assert.equal(res.code, 200, JSON.stringify(res.body));
  const row = fake.db.dogs.at(-1);
  assert.equal(row.name.length, 40);
  assert.equal(row.sex, null);
  assert.ok(!row.notes.includes('\u0000'));
});

test('a verified phone with no card cannot add a dog out of thin air', async () => {
  const res = await call(customerCard, createOtpSessionToken('0508888888'), { action: 'add-dog', dog: { name: 'רפאים' } });
  assert.equal(res.code, 404);
  assert.ok(!fake.db.dogs.some((d) => d.name === 'רפאים'));
});
