import { createClient } from '@supabase/supabase-js';

// Daily logical snapshot of the business tables into a PRIVATE Supabase Storage bucket
// ("backups"), triggered by the daily cron (/api/reminders-run).
//
// This protects against mistakes (bad migration, bug, accidental delete). It lives in the
// same Supabase project, so it is NOT an off-site backup: keep downloading a copy now and
// then, or use Supabase Pro daily backups for real disaster recovery.
// The repository is PUBLIC: never write backups to git.

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const BUCKET = 'backups';
const PAGE_SIZE = 1000;
const KEEP_DAILY_DAYS = 30;
const KEEP_MONTHLY_DAYS = 365;

// Business data only: no OTP codes, no chat history.
export const BACKUP_TABLES = [
  'appointments',
  'customers',
  'dogs',
  'grooming_records',
  'calendar_events',
  'tasks',
  'business_schedule',
  'whatsapp_reminders',
  'business_settings',
  'expenses',
  'refunds'
];

const fileNameFor = (date) => `pawlished-backup-${date.toISOString().slice(0, 10)}.json`;

// Keeps the last 30 days plus the first snapshot of each month for a year.
export const selectBackupsToDelete = (names = [], now = new Date()) => {
  const dayMs = 24 * 60 * 60 * 1000;
  return names.filter((name) => {
    const match = /^pawlished-backup-(\d{4}-\d{2}-\d{2})\.json$/.exec(name);
    if (!match) return false; // never touch files we did not create
    const fileDate = new Date(`${match[1]}T00:00:00Z`);
    if (Number.isNaN(fileDate.getTime())) return false;
    const ageDays = (now.getTime() - fileDate.getTime()) / dayMs;
    const isFirstOfMonth = match[1].endsWith('-01');
    if (ageDays <= KEEP_DAILY_DAYS) return false;
    if (isFirstOfMonth && ageDays <= KEEP_MONTHLY_DAYS) return false;
    return true;
  });
};

const fetchAllRows = async (supabase, table) => {
  const rows = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase.from(table).select('*').range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`Backup read failed for ${table}: ${error.message}`);
    rows.push(...(data || []));
    if (!data || data.length < PAGE_SIZE) break;
  }
  return rows;
};

const buildSnapshot = async (supabase, now) => {
  const snapshot = { exported_at: now.toISOString(), project: 'pawlished' };
  const counts = {};
  for (const table of BACKUP_TABLES) {
    snapshot[table] = await fetchAllRows(supabase, table);
    counts[table] = snapshot[table].length;
  }

  // Safety net: never hand out (or overwrite a good snapshot with) an empty one.
  if (counts.appointments === 0 && counts.customers === 0) {
    throw new Error('Backup skipped: appointments and customers are both empty');
  }
  return { snapshot, counts };
};

// Same snapshot, returned to the caller instead of stored: used for the weekly copy that a script
// on the owner's own computer pulls (see OPERATIONS.md), so a copy exists outside Supabase.
export const exportSnapshot = async (now = new Date()) => {
  if (!supabaseUrl || !supabaseServiceKey) throw new Error('Supabase service role not configured');
  const supabase = createClient(supabaseUrl, supabaseServiceKey, { auth: { persistSession: false } });
  return buildSnapshot(supabase, now);
};

export const runDailyBackup = async (now = new Date()) => {
  if (!supabaseUrl || !supabaseServiceKey) throw new Error('Supabase service role not configured');
  const supabase = createClient(supabaseUrl, supabaseServiceKey, { auth: { persistSession: false } });

  const { snapshot, counts } = await buildSnapshot(supabase, now);

  const body = JSON.stringify(snapshot);
  const name = fileNameFor(now);
  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(name, new Blob([body], { type: 'application/json' }), { contentType: 'application/json', upsert: true });
  if (uploadError) throw new Error(`Backup upload failed: ${uploadError.message}`);

  let pruned = 0;
  try {
    const { data: files } = await supabase.storage.from(BUCKET).list('', { limit: 1000 });
    const toDelete = selectBackupsToDelete((files || []).map((file) => file.name), now);
    if (toDelete.length > 0) {
      await supabase.storage.from(BUCKET).remove(toDelete);
      pruned = toDelete.length;
    }
  } catch {
    // pruning is best-effort
  }

  return { name, bytes: body.length, counts, pruned };
};
