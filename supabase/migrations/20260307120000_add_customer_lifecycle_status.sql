alter table public.customers
add column if not exists lifecycle_status text;

update public.customers
set lifecycle_status = 'ACTIVE'
where lifecycle_status is null;

alter table public.customers
alter column lifecycle_status set default 'ACTIVE';

alter table public.customers
alter column lifecycle_status set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'customers_lifecycle_status_check'
  ) then
    alter table public.customers
    add constraint customers_lifecycle_status_check
    check (lifecycle_status in ('ACTIVE', 'ON_HOLD'));
  end if;
end;
$$;
