create or replace function public.admin_reset_revenue_baseline()
returns table (reset_at timestamp with time zone)
language sql
security definer
set search_path = ''
as $$
  insert into public.admin_revenue_settings as settings (id, reset_at)
  values (1, clock_timestamp())
  on conflict (id) do update
  set reset_at = greatest(settings.reset_at, excluded.reset_at)
  returning settings.reset_at;
$$;

revoke all on function public.admin_reset_revenue_baseline() from public, anon, authenticated;
grant execute on function public.admin_reset_revenue_baseline() to service_role;
