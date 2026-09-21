begin;
set local lock_timeout = '5s';

-- Every writer advances the version, including credential and profile updates.
-- Admin edit requests compare this value atomically in their UPDATE predicate.
alter table public.admin_accounts
  add column revision integer not null default 0 check (revision >= 0);

create function private.advance_admin_account_revision()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.revision := old.revision + 1;
  return new;
end;
$$;
revoke all on function private.advance_admin_account_revision() from public, anon, authenticated, service_role;
create trigger advance_admin_account_revision
before update on public.admin_accounts
for each row execute function private.advance_admin_account_revision();

commit;
