begin;

alter table public.admin_todos
  add column revision bigint not null default 0
  constraint admin_todos_revision_nonnegative check (revision >= 0);

notify pgrst, 'reload schema';
commit;
