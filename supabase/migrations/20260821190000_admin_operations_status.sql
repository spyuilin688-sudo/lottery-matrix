alter table public.members
  add column if not exists auto_renew boolean not null default true;

create table if not exists public.system_job_status (
  job_name text primary key,
  lottery text not null check (lottery in ('今彩539', '天天樂', '六合彩', '大樂透')),
  status text not null check (status in ('running', 'success', 'failed')),
  started_at timestamptz not null,
  finished_at timestamptz,
  error text,
  updated_at timestamptz not null default now()
);

alter table public.system_job_status enable row level security;

revoke all on table public.system_job_status from anon, authenticated;
