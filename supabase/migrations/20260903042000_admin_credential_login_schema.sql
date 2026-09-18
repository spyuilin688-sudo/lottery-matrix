alter table public.admin_accounts
  add column if not exists password_salt text,
  add column if not exists password_hash text;

create table if not exists public.admin_sessions (
  token_hash text primary key,
  admin_id uuid not null references public.admin_accounts(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

alter table public.admin_sessions enable row level security;
revoke all on table public.admin_sessions from anon, authenticated;
