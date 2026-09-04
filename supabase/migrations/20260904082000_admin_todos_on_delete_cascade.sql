alter table public.admin_todos
  drop constraint if exists admin_todos_admin_id_fkey;

alter table public.admin_todos
  add constraint admin_todos_admin_id_fkey
  foreign key (admin_id)
  references public.admin_accounts (id)
  on delete cascade;
