create table if not exists public.admin_accounts (
  id uuid primary key default gen_random_uuid(),
  account text not null unique,
  name text not null,
  role text not null check (role in ('超級管理員','營運管理員','查看人員')),
  status text not null default '啟用' check (status in ('啟用','停用')),
  can_view boolean not null default true,
  can_add boolean not null default false,
  can_edit boolean not null default false,
  can_delete boolean not null default false,
  last_login_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.admin_accounts enable row level security;

create table if not exists public.admin_login_records (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid references public.admin_accounts(id) on delete set null,
  account text not null,
  login_at timestamptz not null default now(),
  logout_at timestamptz,
  online_minutes integer,
  ip text,
  device text
);
alter table public.admin_login_records enable row level security;

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  operation_time timestamptz not null default now(),
  admin_id uuid references public.admin_accounts(id) on delete set null,
  admin text not null,
  operation_type text not null,
  target_table text not null,
  target_id text,
  content text,
  before_data jsonb,
  after_data jsonb,
  ip text,
  device text
);
alter table public.audit_logs enable row level security;

insert into public.admin_accounts (account,name,role,status,can_view,can_add,can_edit,can_delete)
values ('spyuilin688@gmail.com','管理員','超級管理員','啟用',true,true,true,true)
on conflict (account) do update set
  role='超級管理員', status='啟用', can_view=true, can_add=true, can_edit=true, can_delete=true;