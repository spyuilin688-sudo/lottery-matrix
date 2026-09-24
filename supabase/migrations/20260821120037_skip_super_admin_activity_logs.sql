create or replace function public.skip_super_admin_activity_logs()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.admin_id is not null and exists (
    select 1
    from public.admin_accounts
    where id = new.admin_id and role = '超級管理員'
  ) then
    return null;
  end if;

  return new;
end;
$$;

revoke execute on function public.skip_super_admin_activity_logs() from public, anon, authenticated;
grant execute on function public.skip_super_admin_activity_logs() to service_role;

drop trigger if exists skip_super_admin_login_records on public.admin_login_records;
create trigger skip_super_admin_login_records
before insert on public.admin_login_records
for each row execute function public.skip_super_admin_activity_logs();

drop trigger if exists skip_super_admin_audit_logs on public.audit_logs;
create trigger skip_super_admin_audit_logs
before insert on public.audit_logs
for each row execute function public.skip_super_admin_activity_logs();
