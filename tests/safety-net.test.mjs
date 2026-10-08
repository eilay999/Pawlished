import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeSupabase } from './fakeSupabase.mjs';

process.env.SUPABASE_URL = 'https://fake.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake';

const fake = createFakeSupabase({
  appointments: [
    { id: 'a-ok', status: 'SCHEDULED', date: '2030-01-01T10:00:00Z' },
    { id: 'a-cancelled', status: 'CANCELLED', date: '2030-01-01T11:00:00Z' }
  ]
});
mock.module('@supabase/supabase-js', { namedExports: { createClient: () => fake.client } });

const { extractFailedStatuses } = await import('../api/_lib/whatsappStatus.js');
const { isStaleDayBeforeReminder } = await import('../api/_lib/reminders.js');
const { isAppointmentScheduled } = await import('../api/_lib/appointments.js');

const dayBefore = (date) => ({ source_kind: 'APPOINTMENT', payload: { reminderKind: 'DAY_BEFORE', date } });

test('failed delivery statuses are extracted with the number reduced to four digits', () => {
  const body = {
    entry: [
      {
        changes: [
          {
            value: {
              statuses: [
                { status: 'delivered', recipient_id: '972501111111' },
                { status: 'failed', recipient_id: '972502222222', errors: [{ code: 131047, title: 'Re-engagement message' }] }
              ]
            }
          }
        ]
      }
    ]
  };
  const failures = extractFailedStatuses(body);
  assert.equal(failures.length, 1);
  assert.equal(failures[0].code, 131047);
  assert.equal(failures[0].to, '2222');
  assert.deepEqual(extractFailedStatuses({}), []);
  assert.deepEqual(extractFailedStatuses(null), []);
});

test('a day-before reminder for a past or same-day appointment is stale', () => {
  const now = new Date('2026-10-08T09:00:00Z'); // 12:00 in Israel
  assert.equal(isStaleDayBeforeReminder(dayBefore('2026-05-20'), now), true);
  assert.equal(isStaleDayBeforeReminder(dayBefore('2026-10-08'), now), true);
  assert.equal(isStaleDayBeforeReminder(dayBefore('2026-10-09'), now), false);
});

test('only day-before appointment reminders are judged; malformed dates are left alone', () => {
  const now = new Date('2026-10-08T09:00:00Z');
  assert.equal(isStaleDayBeforeReminder({ source_kind: 'MANUAL', payload: { reminderKind: 'DAY_BEFORE', date: '2020-01-01' } }, now), false);
  assert.equal(isStaleDayBeforeReminder({ source_kind: 'APPOINTMENT', payload: { reminderKind: 'OTHER', date: '2020-01-01' } }, now), false);
  assert.equal(isStaleDayBeforeReminder(dayBefore('not-a-date'), now), false);
  assert.equal(isStaleDayBeforeReminder(null, now), false);
});

test('Israel date is used near midnight UTC', () => {
  const now = new Date('2026-10-08T22:30:00Z'); // already Oct 9 in Israel
  assert.equal(isStaleDayBeforeReminder(dayBefore('2026-10-09'), now), true);
  assert.equal(isStaleDayBeforeReminder(dayBefore('2026-10-10'), now), false);
});

test('only a still-scheduled appointment deserves a reminder', async () => {
  assert.equal(await isAppointmentScheduled('a-ok'), true);
  assert.equal(await isAppointmentScheduled('a-cancelled'), false);
  assert.equal(await isAppointmentScheduled('missing'), false);
  assert.equal(await isAppointmentScheduled(''), false);
});

// ---- off-site backup export ----
const exportHandler = (await import('../api/reminders-run.js')).default;
const callExport = async (headers = {}, method = 'GET') => {
  const result = { status: null, body: null, headers: {} };
  const res = {
    setHeader: (k, v) => { result.headers[k] = v; },
    status(code) { result.status = code; return this; },
    json(body) { result.body = body; return this; }
  };
  await exportHandler({ method, headers, query: { export: 'backup' } }, res);
  return result;
};
const EXPORT_SECRET = 'export-secret-that-is-more-than-32-characters';

test('backup export stays off until a long enough secret is configured', async () => {
  delete process.env.BACKUP_EXPORT_SECRET;
  assert.equal((await callExport({ authorization: `Bearer ${EXPORT_SECRET}` })).status, 401);
});

test('backup export rejects a wrong secret and the cron secret', async () => {
  process.env.BACKUP_EXPORT_SECRET = EXPORT_SECRET;
  assert.equal((await callExport({})).status, 401);
  assert.equal((await callExport({ authorization: 'Bearer nope' })).status, 401);
  assert.equal((await callExport({ authorization: `Bearer ${EXPORT_SECRET}` }, 'POST')).status, 405);
});

test('backup export returns the business tables with the right secret', async () => {
  process.env.BACKUP_EXPORT_SECRET = EXPORT_SECRET;
  fake.db.customers = [{ id: 'c1', name: 'נועה', phone: '0501111111' }];
  const result = await callExport({ authorization: `Bearer ${EXPORT_SECRET}` });
  assert.equal(result.status, 200);
  assert.equal(result.headers['Cache-Control'], 'no-store');
  assert.equal(result.body.project, 'pawlished');
  assert.equal(result.body.customers.length, 1);
  assert.equal(result.body.appointments.length, 2);
});
