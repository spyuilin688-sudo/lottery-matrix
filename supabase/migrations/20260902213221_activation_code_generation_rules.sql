alter table public.activation_code_batches
  drop constraint if exists activation_code_batches_duration_type_check;

alter table public.activation_code_batches
  add constraint activation_code_batches_duration_type_check
  check (duration_type in ('7_days', '15_days', '30_days', '60_days', '90_days', '365_days', 'lifetime'));

alter table public.activation_codes
  drop constraint if exists activation_codes_duration_type_check;

alter table public.activation_codes
  add constraint activation_codes_duration_type_check
  check (duration_type in ('7_days', '15_days', '30_days', '60_days', '90_days', '365_days', 'lifetime'));

alter table public.activation_code_batches
  drop constraint if exists activation_code_batches_quantity_check;

alter table public.activation_code_batches
  add constraint activation_code_batches_quantity_check
  check (quantity in (1, 3, 5, 10, 20));

drop function if exists public.generate_activation_code_batch(text);

create function public.generate_activation_code_batch(
  p_duration_type text,
  p_quantity integer default 10
)
returns setof public.activation_codes
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_batch_id uuid;
  v_created_at timestamptz := pg_catalog.now();
  v_inserted_count integer := 0;
  v_row_count integer;
  v_raw_code text;
  v_code text;
  v_random_bytes bytea;
begin
  if coalesce(pg_catalog.current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'ADMIN_BACKEND_REQUIRED';
  end if;

  if p_duration_type is null
     or p_duration_type not in ('7_days', '15_days', '30_days', '60_days', '90_days', '365_days', 'lifetime') then
    raise exception using errcode = '22023', message = 'INVALID_DURATION_TYPE';
  end if;

  if p_quantity is null or p_quantity not in (1, 3, 5, 10, 20) then
    raise exception using errcode = '22023', message = 'INVALID_QUANTITY';
  end if;

  insert into public.activation_code_batches (duration_type, quantity, created_at, expires_at)
  values (p_duration_type, p_quantity, v_created_at, v_created_at + interval '1 month')
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

  return query
    select activation_code.*
    from public.activation_codes as activation_code
    where activation_code.batch_id = v_batch_id
    order by activation_code.created_at, activation_code.id;
end;
$function$;

revoke execute on function public.generate_activation_code_batch(text, integer) from public, anon, authenticated;
grant execute on function public.generate_activation_code_batch(text, integer) to service_role;

create or replace function public.redeem_activation_code(p_code text)
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

  select member.*
  into v_member
  from public.members as member
  where member.auth_user_id = v_auth_user_id
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'MEMBER_NOT_FOUND';
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

  return pg_catalog.jsonb_build_object(
    'member_id', v_member.id,
    'duration_type', v_activation_code.duration_type,
    'is_lifetime', v_member.is_lifetime,
    'plan_expires_at', v_member.plan_expires_at,
    'redeemed_at', v_now
  );
end;
$function$;
