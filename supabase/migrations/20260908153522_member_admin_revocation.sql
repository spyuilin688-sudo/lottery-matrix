begin;
set local lock_timeout = '5s';

-- Keep the existing financial implementation intact, but remove every direct
-- client entry point to it. The public wrapper locks and checks the member first.
alter function public.redeem_activation_code(text) set schema private;
alter function public.member_transfer_request_submit(text, text) set schema private;
revoke all on function private.redeem_activation_code(text) from public, anon, authenticated, service_role;
revoke all on function private.member_transfer_request_submit(text, text) from public, anon, authenticated, service_role;

create function private.lock_active_member_id()
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_member public.members%rowtype;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION_REQUIRED';
  end if;
  select * into v_member from public.members
  where auth_user_id = (select auth.uid()) for update;
  if not found or coalesce(v_member.status, '') in ('停用', 'disabled', 'inactive') then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;
  return v_member.id;
end;
$$;
revoke all on function private.lock_active_member_id() from public, anon, authenticated, service_role;

create function public.redeem_activation_code(p_code text)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform private.lock_active_member_id();
  return private.redeem_activation_code(p_code);
end;
$$;
create function public.member_transfer_request_submit(p_plan_code text, p_account_last_five text)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform private.lock_active_member_id();
  return private.member_transfer_request_submit(p_plan_code, p_account_last_five);
end;
$$;
revoke all on function public.redeem_activation_code(text) from public, anon, authenticated, service_role;
revoke all on function public.member_transfer_request_submit(text, text) from public, anon, authenticated, service_role;
grant execute on function public.redeem_activation_code(text) to authenticated;
grant execute on function public.member_transfer_request_submit(text, text) to authenticated;

-- All credential writers (including direct admin updates) revoke atomically.
-- The version also rejects an old-password login inserted after this deletion.
alter table public.admin_accounts add column credential_version integer not null default 0 check (credential_version >= 0);
alter table public.admin_sessions add column credential_version integer not null default 0 check (credential_version >= 0);
create function private.revoke_admin_sessions_on_password_change()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.password_hash is distinct from old.password_hash
    or new.password_salt is distinct from old.password_salt then
    new.credential_version := old.credential_version + 1;
    delete from public.admin_sessions where admin_id = old.id;
  else
    new.credential_version := old.credential_version;
  end if;
  return new;
end;
$$;
revoke all on function private.revoke_admin_sessions_on_password_change() from public, anon, authenticated, service_role;
create trigger revoke_admin_sessions_on_password_change
before update on public.admin_accounts
for each row execute function private.revoke_admin_sessions_on_password_change();

-- Retire the Supabase Auth/admin_profiles path. Current admin routes authorize
-- cookie sessions and access these tables through the service-role backend.
alter policy "Admins or members can read members" on public.members
using ((select auth.uid()) is not null and auth_user_id = (select auth.uid()));
alter policy "Admins or members can read Matrix custom status configs" on public.matrix_custom_status_configs
using (member_id in (select member.id from public.members as member where member.auth_user_id = (select auth.uid())));
drop policy "Admins can read admin profiles" on public.admin_profiles;
drop policy "Admins can read plans" on public.plans;
drop policy "Admins can read transfer requests" on public.transfer_requests;
drop policy "Admins can read payments" on public.payments;
drop policy "Admins can read activation code batches" on public.activation_code_batches;
drop policy "Admins can read activation codes" on public.activation_codes;
revoke select on public.admin_profiles from public, anon, authenticated, service_role;
revoke execute on function public.is_admin() from public, anon, authenticated, service_role;
revoke execute on function public.admin_dashboard_stats() from public, anon, authenticated, service_role;
commit;

