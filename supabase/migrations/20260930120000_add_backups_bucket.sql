-- Private bucket for the daily JSON snapshots written by /api/reminders-run (api/_lib/backup.js).
-- No policies on purpose: only the service role (server side) can read or write it.
insert into storage.buckets (id, name, public)
values ('backups', 'backups', false)
on conflict (id) do nothing;
