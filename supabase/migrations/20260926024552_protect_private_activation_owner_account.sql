begin;
set local lock_timeout = '5s';

-- Anchor the private-code owner's identity to the existing row, so another
-- administrator cannot take over by editing credentials, role or account.
create table private.private_activation_owner_guard (
  singleton boolean primary key default true check (singleton),
  admin_id uuid not null unique references public.admin_accounts(id)
);
revoke all on table private.private_activation_owner_guard from public, anon, authenticated;
grant select on table private.private_activation_owner_guard to service_role;

do $$
declare v_owner_id uuid;
begin
  if (select count(*) from public.admin_accounts
      where pg_catalog.lower(pg_catalog.btrim(account)) = 'spyuilin688@gmail.com') <> 1
     or not exists (select 1 from public.admin_accounts
      where pg_catalog.lower(pg_catalog.btrim(account)) = 'spyuilin688@gmail.com'
        and role = '超級管理員' and status = '啟用') then
    raise exception 'DESIGNATED_PRIVATE_ACTIVATION_OWNER_MISSING';
  end if;
  select id into v_owner_id from public.admin_accounts
    where pg_catalog.lower(pg_catalog.btrim(account)) = 'spyuilin688@gmail.com'
      and role = '超級管理員' and status = '啟用';
  insert into private.private_activation_owner_guard(singleton, admin_id) values (true, v_owner_id);
end;
$$;

create function private.protect_private_activation_owner_account()
returns trigger language plpgsql set search_path = '' as $function$
declare v_owner_id uuid;
begin
  select admin_id into v_owner_id from private.private_activation_owner_guard where singleton = true;
  if tg_op = 'INSERT' then
    if pg_catalog.lower(pg_catalog.btrim(new.account)) = 'spyuilin688@gmail.com'
       and new.id is distinct from v_owner_id then
      raise exception using errcode = '42501', message = 'PRIVATE_ACTIVATION_OWNER_PROTECTED';
    end if;
    return new;
  end if;
  if old.id = v_owner_id then
    if tg_op = 'DELETE' then
      raise exception using errcode = '42501', message = 'PRIVATE_ACTIVATION_OWNER_PROTECTED';
    end if;
    if new.account is distinct from 'spyuilin688@gmail.com'
       or new.role is distinct from '超級管理員' or new.status is distinct from '啟用' then
      raise exception using errcode = '42501', message = 'PRIVATE_ACTIVATION_OWNER_PROTECTED';
    end if;
    if (new.password_salt, new.password_hash) is distinct from (old.password_salt, old.password_hash)
       and pg_catalog.current_setting('private.owner_password_update', true) is distinct from old.id::text then
      raise exception using errcode = '42501', message = 'PRIVATE_ACTIVATION_OWNER_PROTECTED';
    end if;
  elsif tg_op = 'UPDATE' and pg_catalog.lower(pg_catalog.btrim(new.account)) = 'spyuilin688@gmail.com' then
    raise exception using errcode = '42501', message = 'PRIVATE_ACTIVATION_OWNER_PROTECTED';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$function$;
revoke all on function private.protect_private_activation_owner_account() from public, anon, authenticated;
create trigger protect_private_activation_owner_account
  before insert or update or delete on public.admin_accounts
  for each row execute function private.protect_private_activation_owner_account();

create function public.admin_update_private_activation_owner_password(
  p_actor_id uuid, p_expected_revision integer, p_name text,
  p_password_salt text, p_password_hash text
) returns jsonb language plpgsql security invoker set search_path = '' as $function$
declare v_owner public.admin_accounts%rowtype;
declare v_owner_id uuid;
begin
  if coalesce(
      nullif(pg_catalog.current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
      pg_catalog.current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'ADMIN_BACKEND_REQUIRED';
  end if;
  select admin_id into v_owner_id from private.private_activation_owner_guard where singleton = true;
  if p_actor_id is distinct from v_owner_id then
    raise exception using errcode = '42501', message = 'PRIVATE_ACTIVATION_OWNER_PROTECTED';
  end if;
  select * into v_owner from public.admin_accounts where id = v_owner_id for update;
  if not found or v_owner.account <> 'spyuilin688@gmail.com'
     or v_owner.role <> '超級管理員' or v_owner.status <> '啟用' then
    raise exception using errcode = '42501', message = 'PRIVATE_ACTIVATION_OWNER_PROTECTED';
  end if;
  if p_expected_revision is distinct from v_owner.revision then
    raise exception using errcode = 'PT409', message = 'ADMIN_REVISION_CONFLICT';
  end if;
  if nullif(pg_catalog.btrim(p_name), '') is null
     or nullif(p_password_salt, '') is null
     or nullif(p_password_hash, '') is null then
    raise exception using errcode = '22023', message = 'INVALID_ADMIN_INPUT';
  end if;
  perform pg_catalog.set_config('private.owner_password_update', v_owner_id::text, true);
  update public.admin_accounts set name = pg_catalog.btrim(p_name),
      password_salt = p_password_salt, password_hash = p_password_hash
    where id = v_owner_id returning * into v_owner;
  return pg_catalog.to_jsonb(v_owner);
end;
$function$;
revoke all on function public.admin_update_private_activation_owner_password(uuid,integer,text,text,text)
  from public, anon, authenticated;
grant execute on function public.admin_update_private_activation_owner_password(uuid,integer,text,text,text)
  to service_role;

notify pgrst, 'reload schema';
commit;
