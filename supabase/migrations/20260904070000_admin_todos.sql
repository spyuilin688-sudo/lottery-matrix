create table public.admin_todos (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references public.admin_accounts(id),
  content varchar(100) not null,
  created_at timestamptz not null default now(),
  constraint admin_todos_content_length
    check (char_length(btrim(content)) between 1 and 100)
);

create index admin_todos_created_at_idx
  on public.admin_todos (created_at desc, id desc);

alter table public.admin_todos enable row level security;

revoke all on table public.admin_todos from public, anon, authenticated;
grant select, insert, update, delete on table public.admin_todos to service_role;
