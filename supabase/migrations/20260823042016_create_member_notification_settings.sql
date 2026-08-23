create table if not exists public.notification_settings (
  member_id uuid primary key references public.members(id) on delete cascade,
  settings jsonb not null check (jsonb_typeof(settings) = 'object'),
  updated_at timestamptz not null default now()
);

alter table public.notification_settings enable row level security;
