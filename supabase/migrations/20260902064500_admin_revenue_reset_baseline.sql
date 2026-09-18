create table if not exists public.admin_revenue_settings (
  id smallint primary key default 1 check (id = 1),
  reset_at timestamp with time zone not null
);

alter table public.admin_revenue_settings enable row level security;

revoke all on table public.admin_revenue_settings from public, anon, authenticated;
revoke all on table public.admin_revenue_settings from service_role;
grant select, insert, update on table public.admin_revenue_settings to service_role;
