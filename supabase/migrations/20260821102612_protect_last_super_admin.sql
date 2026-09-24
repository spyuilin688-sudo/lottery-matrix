create or replace function public.protect_last_enabled_super_admin()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_removing boolean := tg_op = 'DELETE';
begin
  if tg_op = 'UPDATE' then
    v_removing := new.role <> '超級管理員' or new.status <> '啟用';
  end if;
  if old.role = '超級管理員' and old.status = '啟用' and v_removing then
    perform pg_advisory_xact_lock(hashtext('admin_accounts_enabled_super'));
    if not exists (
      select 1 from public.admin_accounts
      where id <> old.id and role = '超級管理員' and status = '啟用'
    ) then
      raise exception '系統必須保留至少一位啟用中的超級管理員';
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists protect_last_enabled_super_admin_trigger on public.admin_accounts;
create trigger protect_last_enabled_super_admin_trigger
before update or delete on public.admin_accounts
for each row execute function public.protect_last_enabled_super_admin();

revoke all on function public.protect_last_enabled_super_admin() from public, anon, authenticated;
