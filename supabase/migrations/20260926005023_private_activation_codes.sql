-- Keep public batches unchanged; private batches are visible only through the owner's API.
alter table public.activation_code_batches
  add column is_private boolean not null default false;

-- A redeemed code can be deleted without deleting or revealing its entitlement source.
-- The snapshot is used only by the admin API to redact matching member data.
create table public.private_activation_redemptions (
  member_id uuid primary key references public.members(id) on delete cascade,
  code_id uuid not null,
  current_plan_id uuid,
  plan_started_at timestamptz,
  plan_expires_at timestamptz,
  is_lifetime boolean not null,
  redeemed_at timestamptz not null
);
alter table public.private_activation_redemptions enable row level security;
revoke all on table public.private_activation_redemptions from public, anon, authenticated;
grant select, insert, update on table public.private_activation_redemptions to service_role;

create function public.admin_generate_activation_code_batch(
  p_duration_type text,
  p_quantity integer,
  p_actor_id uuid,
  p_request_id uuid,
  p_private boolean
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_actor public.admin_accounts%rowtype;
  v_existing public.activation_code_batches%rowtype;
  v_batch_id uuid;
  v_created_at timestamptz := pg_catalog.now();
  v_inserted_count integer := 0;
  v_row_count integer;
  v_raw_code text;
  v_code text;
  v_random_bytes bytea;
begin
  if coalesce(
    nullif(pg_catalog.current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
    pg_catalog.current_setting('request.jwt.claim.role', true), ''
  ) <> 'service_role' then
    raise exception using errcode = '42501', message = 'ADMIN_BACKEND_REQUIRED';
  end if;
  if p_private is null then
    raise exception using errcode = '22023', message = 'INVALID_ACTIVATION_SCOPE';
  end if;
  if p_request_id is null then
    raise exception using errcode = '22023', message = 'ACTIVATION_REQUEST_REQUIRED';
  end if;
  if p_duration_type is null or p_duration_type not in ('7_days','15_days','30_days','60_days','90_days','365_days','lifetime') then
    raise exception using errcode = '22023', message = 'INVALID_DURATION_TYPE';
  end if;
  if p_quantity is null or p_quantity not in (1,3,5,10,20) then
    raise exception using errcode = '22023', message = 'INVALID_QUANTITY';
  end if;
  select * into v_actor from public.admin_accounts where id = p_actor_id for share;
  if not found or v_actor.status <> '啟用'
     or v_actor.role not in ('超級管理員','營運管理員')
     or (v_actor.role <> '超級管理員' and v_actor.can_add is false) then
    raise exception using errcode = '42501', message = 'ACTIVATION_CREATE_FORBIDDEN';
  end if;
  if p_private and (v_actor.role <> '超級管理員'
     or pg_catalog.lower(pg_catalog.btrim(v_actor.account)) is distinct from 'spyuilin688@gmail.com') then
    raise exception using errcode = '42501', message = 'PRIVATE_ACTIVATION_CODE_FORBIDDEN';
  end if;
  if v_actor.role = '營運管理員' and p_duration_type not in ('7_days','15_days') then
    raise exception using errcode = '42501', message = 'ACTIVATION_DURATION_FORBIDDEN';
  end if;
  -- Serializes concurrent delivery/retry of this operation for the transaction.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_request_id::text, 0));
  select * into v_existing from public.activation_code_batches where request_id = p_request_id;
  if found then
    if v_existing.requested_by is distinct from p_actor_id
       or v_existing.duration_type <> p_duration_type or v_existing.quantity <> p_quantity
       or v_existing.is_private is distinct from p_private then
      raise exception using errcode = '22023', message = 'ACTIVATION_REQUEST_CONFLICT';
    end if;
    return pg_catalog.jsonb_build_object('batchId',v_existing.id,'count',v_existing.quantity);
  end if;
  insert into public.activation_code_batches (duration_type, quantity, created_at, expires_at, is_private)
  values (p_duration_type, p_quantity, v_created_at, v_created_at + interval '1 month', p_private)
  returning id into v_batch_id;

  while v_inserted_count < p_quantity loop
    v_random_bytes := extensions.gen_random_bytes(16);
    select pg_catalog.string_agg(
      pg_catalog.substr('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', (pg_catalog.get_byte(v_random_bytes, byte_index) % 36) + 1, 1),
      '' order by byte_index
    )
    into v_raw_code
    from pg_catalog.generate_series(0, 15) as generated(byte_index);

    v_code := pg_catalog.substr(v_raw_code, 1, 4)
      || '-' || pg_catalog.substr(v_raw_code, 5, 4)
      || '-' || pg_catalog.substr(v_raw_code, 9, 4)
      || '-' || pg_catalog.substr(v_raw_code, 13, 4);

    insert into public.activation_codes (batch_id, code, duration_type, created_at, expires_at, status)
    values (v_batch_id, v_code, p_duration_type, v_created_at, v_created_at + interval '1 month', 'unused')
    on conflict (code) do nothing;

    get diagnostics v_row_count = row_count;
    v_inserted_count := v_inserted_count + v_row_count;
  end loop;


  update public.activation_code_batches
  set request_id = p_request_id, requested_by = p_actor_id where id = v_batch_id;
  if not p_private then
    insert into public.audit_logs(admin_id,admin,operation_type,target_table,target_id,content,after_data)
    values (p_actor_id,coalesce(nullif(v_actor.name,''),v_actor.account),'批次新增','activation_codes',v_batch_id::text,
      '批次建立 ' || p_quantity || ' 組啟動碼',
      pg_catalog.jsonb_build_object('batchId',v_batch_id,'durationType',p_duration_type,'count',p_quantity));
  end if;
  return pg_catalog.jsonb_build_object('batchId',v_batch_id,'count',p_quantity);
end;
$function$;
revoke all on function public.admin_generate_activation_code_batch(text,integer,uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.admin_generate_activation_code_batch(text,integer,uuid,uuid,boolean) to service_role;

-- Preserve the previous RPC signature for existing callers and in-flight retries.
create or replace function public.admin_generate_activation_code_batch(
  p_duration_type text, p_quantity integer, p_actor_id uuid, p_request_id uuid
) returns jsonb language plpgsql security invoker set search_path = '' as $function$
begin
  return public.admin_generate_activation_code_batch(p_duration_type,p_quantity,p_actor_id,p_request_id,false);
end;
$function$;

-- Keep the member-before-code lock order and the single authoritative redemption.
create or replace function private.redeem_activation_code(p_code text)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_auth_user_id uuid := (select auth.uid());
  v_normalized_code text := pg_catalog.upper(pg_catalog.btrim(p_code));
  v_now timestamptz := pg_catalog.now();
  v_activation_code public.activation_codes%rowtype;
  v_member public.members%rowtype;
  v_duration_days integer;
  v_target_plan_name text;
  v_target_plan_id uuid;
  v_target_plan_rank integer;
  v_current_plan_rank integer := 0;
  v_effective_plan_id uuid;
begin
  if v_auth_user_id is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION_REQUIRED';
  end if;

  select member.*
  into v_member
  from public.members as member
  where member.auth_user_id = v_auth_user_id
  for update;

  if not found or coalesce(v_member.status, '') in ('停用', 'disabled', 'inactive') then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  if v_normalized_code is null
     or v_normalized_code !~ '^[A-Z0-9]{4}(-[A-Z0-9]{4}){3}$' then
    raise exception using errcode = '22023', message = 'INVALID_ACTIVATION_CODE_FORMAT';
  end if;

  select activation_code.*
  into v_activation_code
  from public.activation_codes as activation_code
  where activation_code.code = v_normalized_code
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'ACTIVATION_CODE_NOT_FOUND';
  end if;

  if v_activation_code.status = 'used'
     or v_activation_code.redeemed_at is not null then
    raise exception using errcode = 'P0001', message = 'ACTIVATION_CODE_ALREADY_USED';
  end if;

  if v_activation_code.status = 'expired'
     or v_activation_code.expires_at <= v_now then
    raise exception using errcode = 'P0001', message = 'ACTIVATION_CODE_EXPIRED';
  end if;

  if v_activation_code.duration_type = 'lifetime' then
    update public.members
    set is_lifetime = true,
        plan_started_at = coalesce(plan_started_at, v_now),
        plan_expires_at = null
    where id = v_member.id
    returning * into v_member;
  else
    if v_member.is_lifetime then
      raise exception using errcode = 'P0001', message = 'MEMBER_ALREADY_LIFETIME';
    end if;

    v_target_plan_name := case v_activation_code.duration_type
      when '7_days' then '月費方案'
      when '15_days' then '月費方案'
      when '30_days' then '月費方案'
      when '60_days' then '月費方案'
      when '90_days' then '季費方案'
      when '365_days' then '年費方案'
    end;
    v_duration_days := case v_activation_code.duration_type
      when '7_days' then 7
      when '15_days' then 15
      when '30_days' then 30
      when '60_days' then 60
      when '90_days' then 90
      when '365_days' then 365
    end;
    v_target_plan_rank := case v_target_plan_name
      when '月費方案' then 1
      when '季費方案' then 2
      when '年費方案' then 3
    end;

    select plan.id
    into v_target_plan_id
    from public.plans as plan
    where plan.name = v_target_plan_name;

    if v_target_plan_id is null then
      raise exception using errcode = 'P0001', message = 'ACTIVATION_PLAN_NOT_FOUND';
    end if;

    if coalesce(v_member.plan_expires_at > v_now, false)
       and v_member.current_plan_id is not null then
      select case plan.name
        when '月費方案' then 1
        when '季費方案' then 2
        when '年費方案' then 3
        else 0
      end
      into v_current_plan_rank
      from public.plans as plan
      where plan.id = v_member.current_plan_id;
    end if;

    v_current_plan_rank := coalesce(v_current_plan_rank, 0);
    v_effective_plan_id := case
      when v_current_plan_rank > v_target_plan_rank then v_member.current_plan_id
      else v_target_plan_id
    end;

    update public.members
    set current_plan_id = v_effective_plan_id,
        plan_started_at = case
          when coalesce(v_member.plan_expires_at > v_now, false)
            then coalesce(v_member.plan_started_at, v_now)
          else v_now
        end,
        plan_expires_at = greatest(
          coalesce(v_member.plan_expires_at, v_now),
          v_now
        ) + pg_catalog.make_interval(days => v_duration_days)
    where id = v_member.id
    returning * into v_member;
  end if;

  update public.activation_codes
  set status = 'used',
      redeemed_by_member_id = v_member.id,
      redeemed_at = v_now
  where id = v_activation_code.id;

  if exists (
    select 1 from public.activation_code_batches
    where id = v_activation_code.batch_id and is_private
  ) then
    insert into public.private_activation_redemptions (
      member_id, code_id, current_plan_id, plan_started_at,
      plan_expires_at, is_lifetime, redeemed_at
    ) values (
      v_member.id, v_activation_code.id, v_member.current_plan_id, v_member.plan_started_at,
      v_member.plan_expires_at, v_member.is_lifetime, v_now
    ) on conflict (member_id) do update set
      code_id = excluded.code_id,
      current_plan_id = excluded.current_plan_id,
      plan_started_at = excluded.plan_started_at,
      plan_expires_at = excluded.plan_expires_at,
      is_lifetime = excluded.is_lifetime,
      redeemed_at = excluded.redeemed_at;
  end if;

  return pg_catalog.jsonb_build_object(
    'member_id', v_member.id,
    'duration_type', v_activation_code.duration_type,
    'is_lifetime', v_member.is_lifetime,
    'plan_expires_at', v_member.plan_expires_at,
    'redeemed_at', v_now
  );
end;
$function$;

create or replace function public.admin_delete_activation_code(
  p_code_id uuid,
  p_actor_id uuid,
  p_actor_name text
) returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_before jsonb;
  v_actor_role text;
  v_actor_account text;
  v_is_private boolean;
  v_member_id uuid;
  v_locked_member_id uuid;
  v_member_before public.members%rowtype;
  v_member_after public.members%rowtype;
begin
  if coalesce(
    nullif(pg_catalog.current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
    ''
  ) <> 'service_role' then
    raise exception using errcode = '42501', message = 'ADMIN_BACKEND_REQUIRED';
  end if;

  select activation_code.redeemed_by_member_id
  into v_member_id
  from public.activation_codes as activation_code
  where activation_code.id = p_code_id;

  if not found then
    raise exception using errcode = 'P0002', message = 'ACTIVATION_CODE_NOT_FOUND';
  end if;

  if v_member_id is not null then
    select member.*
    into v_member_before
    from public.members as member
    where member.id = v_member_id
    for update;

    if not found then
      raise exception using errcode = 'P0001', message = 'ACTIVATION_CODE_REDEEMED_MEMBER_NOT_FOUND';
    end if;
  end if;

  select
    pg_catalog.to_jsonb(activation_code),
    activation_code.redeemed_by_member_id,
    batch.is_private
  into v_before, v_locked_member_id, v_is_private
  from public.activation_codes as activation_code
  join public.activation_code_batches as batch on batch.id = activation_code.batch_id
  where activation_code.id = p_code_id
  for update of activation_code;

  if v_before is null then
    raise exception using errcode = 'P0002', message = 'ACTIVATION_CODE_NOT_FOUND';
  end if;

  if v_locked_member_id is not null and v_member_id is null then
    select member.*
    into v_member_before
    from public.members as member
    where member.id = v_locked_member_id
    for update;

    if not found then
      raise exception using errcode = 'P0001', message = 'ACTIVATION_CODE_REDEEMED_MEMBER_NOT_FOUND';
    end if;
    v_member_id := v_locked_member_id;
  elsif v_locked_member_id is distinct from v_member_id then
    raise exception using errcode = 'P0001', message = 'ACTIVATION_CODE_REDEMPTION_CHANGED';
  end if;

  select admin_account.role, admin_account.account
  into v_actor_role, v_actor_account
  from public.admin_accounts as admin_account
  where admin_account.id = p_actor_id
    and admin_account.status = '啟用';

  if v_is_private and (v_actor_role is distinct from '超級管理員'
     or pg_catalog.lower(pg_catalog.btrim(v_actor_account)) is distinct from 'spyuilin688@gmail.com') then
    raise exception using errcode = '42501', message = 'PRIVATE_ACTIVATION_CODE_FORBIDDEN';
  end if;

  if v_before ->> 'status' = 'used'
     or v_before ->> 'redeemed_at' is not null
     or v_locked_member_id is not null then
    if v_actor_role is distinct from '超級管理員' then
      raise exception using
        errcode = '42501',
        message = 'REDEEMED_ACTIVATION_CODE_DELETE_FORBIDDEN';
    end if;
  end if;

  delete from public.activation_codes
  where id = p_code_id;

  if v_member_id is not null then
    select member.*
    into v_member_after
    from public.members as member
    where member.id = v_member_id;

    if not found
       or row(
         v_member_after.current_plan_id,
         v_member_after.plan_started_at,
         v_member_after.plan_expires_at,
         v_member_after.is_lifetime,
         v_member_after.auto_renew,
         v_member_after.subscription_revision
       ) is distinct from row(
         v_member_before.current_plan_id,
         v_member_before.plan_started_at,
         v_member_before.plan_expires_at,
         v_member_before.is_lifetime,
         v_member_before.auto_renew,
         v_member_before.subscription_revision
       ) then
      raise exception using
        errcode = 'P0001',
        message = 'ACTIVATION_CODE_DELETE_ENTITLEMENT_CHANGED';
    end if;
  end if;

  if v_actor_role is distinct from '超級管理員' then
    insert into public.audit_logs (
      admin_id,
      admin,
      operation_type,
      target_table,
      target_id,
      content,
      before_data
    ) values (
      p_actor_id,
      p_actor_name,
      '刪除',
      'activation_codes',
      p_code_id::text,
      '刪除啟動碼',
      v_before
    );
  end if;

  return pg_catalog.jsonb_build_object('deleted', true);
end;
$$;

notify pgrst, 'reload schema';
