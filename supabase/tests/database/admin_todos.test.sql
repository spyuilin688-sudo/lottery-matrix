begin;

select plan(2);

select is(
  (
    select delete_rule
    from information_schema.referential_constraints
    where constraint_schema = 'public'
      and constraint_name = 'admin_todos_admin_id_fkey'
  ),
  'CASCADE',
  'admin_todos cascades when its administrator is deleted'
);

insert into public.admin_accounts (
  id,
  account,
  name,
  role,
  status
) values (
  '40000000-0000-0000-0000-000000000004',
  'todo-cascade@example.test',
  'Todo Cascade',
  '營運管理員',
  '啟用'
);

insert into public.admin_todos (admin_id, content)
values ('40000000-0000-0000-0000-000000000004', 'delete with administrator');

delete from public.admin_accounts
where id = '40000000-0000-0000-0000-000000000004';

select is(
  (
    select count(*)
    from public.admin_todos
    where admin_id = '40000000-0000-0000-0000-000000000004'
  ),
  0::bigint,
  'deleting an administrator cascades to authored todos'
);

select * from finish();

rollback;
