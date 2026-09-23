-- Apply before rolling out the admin backend. Each retry key identifies one
-- committed admin action; payment rows and prior revenue snapshots are untouched.
create table private.admin_mutation_requests (
  request_id uuid primary key,
  operation text not null check (operation in ('revenue_reset', 'subscription_renew')),
  actor_id uuid not null,
  member_id uuid,
  plan_id uuid,
  result jsonb not null,
  created_at timestamptz not null default pg_catalog.clock_timestamp()
);

alter table private.admin_mutation_requests enable row level security;
revoke all on table private.admin_mutation_requests from public, anon, authenticated;
grant usage on schema private to service_role;
grant select, insert on table private.admin_mutation_requests to service_role;

alter table public.members
  add column subscription_revision bigint not null default 0
    check (subscription_revision >= 0);

create function private.bump_member_subscription_revision()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if row(new.current_plan_id, new.plan_started_at, new.plan_expires_at, new.is_lifetime, new.auto_renew)
       is distinct from
     row(old.current_plan_id, old.plan_started_at, old.plan_expires_at, old.is_lifetime, old.auto_renew) then
    new.subscription_revision := old.subscription_revision + 1;
  else
    new.subscription_revision := old.subscription_revision;
  end if;
  return new;
end;
$$;

create trigger members_subscription_revision_bump
before update on public.members
for each row execute function private.bump_member_subscription_revision();

create function public.admin_reset_revenue_baseline_v2(
  p_request_id uuid,
  p_actor_id uuid
) returns table (reset_at timestamptz)
language plpgsql security invoker set search_path = '' as $$
declare
  v_existing private.admin_mutation_requests%rowtype;
  v_at timestamptz;
begin
  if coalesce(
    nullif(pg_catalog.current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
    pg_catalog.current_setting('request.jwt.claim.role', true), ''
  ) <> 'service_role' then
    raise exception using errcode = '42501', message = 'ADMIN_BACKEND_REQUIRED';
  end if;
  if p_request_id is null or p_actor_id is null then
    raise exception using errcode = '22023', message = 'ADMIN_REQUEST_REQUIRED';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_request_id::text, 0));
  select * into v_existing from private.admin_mutation_requests
  where request_id = p_request_id;
  if found then
    if v_existing.operation <> 'revenue_reset' or v_existing.actor_id <> p_actor_id then
      raise exception using errcode = 'PT409', message = 'ADMIN_REQUEST_CONFLICT';
    end if;
    return query select (v_existing.result ->> 'reset_at')::timestamptz;
    return;
  end if;

  insert into public.admin_revenue_settings as settings (id, reset_at)
  values (1, pg_catalog.clock_timestamp())
  on conflict (id) do update
    set reset_at = greatest(settings.reset_at, excluded.reset_at)
  returning settings.reset_at into v_at;
  insert into private.admin_mutation_requests(request_id, operation, actor_id, result)
  values (p_request_id, 'revenue_reset', p_actor_id, pg_catalog.jsonb_build_object('reset_at', v_at));
  return query select v_at;
end;
$$;

create function public.admin_update_subscription_guarded(
  p_member_id uuid,
  p_action text,
  p_plan_id uuid,
  p_expires_at timestamptz,
  p_now timestamptz,
  p_actor_id uuid,
  p_actor_name text,
  p_expected_revision bigint,
  p_request_id uuid
) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  v_existing private.admin_mutation_requests%rowtype;
  v_member public.members%rowtype;
  v_duration integer;
  v_after jsonb;
  v_base timestamptz;
begin
  if coalesce(
    nullif(pg_catalog.current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
    pg_catalog.current_setting('request.jwt.claim.role', true), ''
  ) <> 'service_role' then
    raise exception using errcode = '42501', message = 'ADMIN_BACKEND_REQUIRED';
  end if;
  if p_action is null or p_action not in ('activate', 'renew', 'cancel', 'adjustExpiry', 'lifetime') then
    raise exception using errcode = '22023', message = 'INVALID_SUBSCRIPTION_ACTION';
  end if;
  if p_action = 'adjustExpiry' and p_expected_revision is null then
    raise exception using errcode = '22023', message = 'SUBSCRIPTION_REVISION_REQUIRED';
  end if;
  if p_action = 'renew' then
    if p_request_id is null or p_actor_id is null then
      raise exception using errcode = '22023', message = 'ADMIN_REQUEST_REQUIRED';
    end if;
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_request_id::text, 0));
    select * into v_existing from private.admin_mutation_requests
    where request_id = p_request_id;
    if found then
      if v_existing.operation <> 'subscription_renew'
        or v_existing.actor_id <> p_actor_id
        or v_existing.member_id is distinct from p_member_id
        or v_existing.plan_id is distinct from p_plan_id then
        raise exception using errcode = 'PT409', message = 'ADMIN_REQUEST_CONFLICT';
      end if;
      return v_existing.result;
    end if;
  end if;

  select * into v_member from public.members where id = p_member_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'MEMBER_NOT_FOUND'; end if;
  if p_action = 'adjustExpiry' and v_member.subscription_revision <> p_expected_revision then
    raise exception using errcode = 'PT409', message = 'SUBSCRIPTION_CONFLICT';
  end if;

  if p_action = 'cancel' then
    update public.members set auto_renew = false where id = p_member_id
    returning pg_catalog.to_jsonb(members) into v_after;
  elsif p_action = 'lifetime' then
    update public.members set plan_expires_at = null, is_lifetime = true, auto_renew = false
    where id = p_member_id returning pg_catalog.to_jsonb(members) into v_after;
  elsif p_action = 'adjustExpiry' then
    if p_expires_at is null then raise exception using errcode = '22023', message = 'INVALID_EXPIRY'; end if;
    update public.members set plan_expires_at = p_expires_at, is_lifetime = false
    where id = p_member_id returning pg_catalog.to_jsonb(members) into v_after;
  else
    select duration_days into v_duration from public.plans where id = p_plan_id;
    if v_duration is null or v_duration <= 0 then
      raise exception using errcode = '22023', message = 'INVALID_SUBSCRIPTION_PLAN';
    end if;
    v_base := case when p_action = 'renew' then greatest(p_now, coalesce(v_member.plan_expires_at, p_now)) else p_now end;
    update public.members
    set current_plan_id = p_plan_id,
        plan_started_at = case when p_action = 'activate' then p_now else coalesce(v_member.plan_started_at, p_now) end,
        plan_expires_at = v_base + pg_catalog.make_interval(days => v_duration),
        is_lifetime = false,
        auto_renew = true
    where id = p_member_id returning pg_catalog.to_jsonb(members) into v_after;
  end if;

  insert into public.audit_logs(admin_id, admin, operation_type, target_table, target_id, content, before_data, after_data)
  values (p_actor_id, p_actor_name, '修改', 'members', p_member_id::text,
    '訂閱操作：' || p_action, pg_catalog.to_jsonb(v_member), v_after);
  if p_action = 'renew' then
    insert into private.admin_mutation_requests(request_id, operation, actor_id, member_id, plan_id, result)
    values (p_request_id, 'subscription_renew', p_actor_id, p_member_id, p_plan_id, v_after);
  end if;
  return v_after;
end;
$$;

revoke all on function public.admin_reset_revenue_baseline_v2(uuid,uuid) from public, anon, authenticated;
revoke all on function public.admin_update_subscription_guarded(uuid,text,uuid,timestamptz,timestamptz,uuid,text,bigint,uuid)
  from public, anon, authenticated;
grant execute on function public.admin_reset_revenue_baseline_v2(uuid,uuid) to service_role;
grant execute on function public.admin_update_subscription_guarded(uuid,text,uuid,timestamptz,timestamptz,uuid,text,bigint,uuid)
  to service_role;
