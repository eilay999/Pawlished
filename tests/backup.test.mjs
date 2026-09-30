import test from 'node:test';
import assert from 'node:assert/strict';
import { selectBackupsToDelete, BACKUP_TABLES } from '../api/_lib/backup.js';

const name = (d) => `pawlished-backup-${d}.json`;

test('backup keeps 30 days and first-of-month snapshots for a year', () => {
  const now = new Date('2026-10-15T12:00:00Z');
  const names = [
    name('2026-10-14'), name('2026-09-20'),       // recent: keep
    name('2026-08-10'),                            // old, not first of month: delete
    name('2026-08-01'),                            // old but first of month: keep
    name('2025-01-01'),                            // older than a year: delete
    'notes.txt', 'pawlished-backup-bad-date.json'  // not ours: never delete
  ];
  assert.deepEqual(selectBackupsToDelete(names, now).sort(), [name('2025-01-01'), name('2026-08-10')].sort());
});

test('backup never includes OTP codes or chat history tables', () => {
  for (const table of ['wa_otp', 'whatsapp_messages', 'whatsapp_contexts', 'whatsapp_memories']) {
    assert.ok(!BACKUP_TABLES.includes(table), table);
  }
  assert.ok(BACKUP_TABLES.includes('appointments') && BACKUP_TABLES.includes('customers'));
});
