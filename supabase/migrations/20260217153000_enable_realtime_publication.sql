-- Ensure core app tables publish realtime change events.
do $$
begin
  begin
    alter publication supabase_realtime add table public.customers;
  exception
    when duplicate_object then null;
  end;

  begin
    alter publication supabase_realtime add table public.appointments;
  exception
    when duplicate_object then null;
  end;

  begin
    alter publication supabase_realtime add table public.tasks;
  exception
    when duplicate_object then null;
  end;
end;
$$;
