-- Confirmed provider subscription snapshots. Never seed private billing values in source.
create table public.admin_architecture_subscriptions (
  provider text primary key check (provider in ('railway', 'supabase', 'github', 'cloudflare')),
  plan text check (plan is null or (length(btrim(plan)) > 0 and length(plan) <= 200)),
  fee text check (fee is null or (length(btrim(fee)) > 0 and length(fee) <= 200)),
  renewal_date date,
  verified_at timestamptz,
  check ((plan is null and fee is null and renewal_date is null) or verified_at is not null)
);

alter table public.admin_architecture_subscriptions enable row level security;
revoke all on table public.admin_architecture_subscriptions from public, anon, authenticated;
grant select, insert, update on table public.admin_architecture_subscriptions to service_role;

insert into public.admin_architecture_subscriptions (provider)
values ('railway'), ('supabase'), ('github'), ('cloudflare');

comment on table public.admin_architecture_subscriptions is
  'Admin-only confirmed billing snapshots; not a live provider billing feed. Unknown fields remain NULL.';
