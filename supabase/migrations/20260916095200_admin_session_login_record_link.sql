alter table public.admin_sessions
  add column if not exists login_record_id uuid;

create unique index if not exists admin_sessions_login_record_id_key
  on public.admin_sessions (login_record_id)
  where login_record_id is not null;
