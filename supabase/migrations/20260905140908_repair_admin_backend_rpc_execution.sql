-- Forward repair for the RPC definitions currently deployed in production.
-- COALESCE/GREATEST are SQL constructs, not schema-qualified functions.
-- auth.role() supports both legacy and modern PostgREST claim settings.
-- Existing privileges, transaction boundaries, and audit trigger behavior are preserved.

create or replace function public.admin_review_transfer_request(
  p_transfer_id uuid,
  p_decision text,
  p_now timestamp with time zone,
  p_actor_id uuid,
  p_actor_name text
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_request public.transfer_requests%rowtype;
  v_member public.members%rowtype;
  v_duration integer;
  v_request_after jsonb;
  v_member_after jsonb;
begin
  if p_decision not in ('confirmed', 'rejected') then
    raise exception using errcode = '22023', message = 'INVALID_REVIEW_DECISION';
  end if;

  select * into v_request
  from public.transfer_requests
  where id = p_transfer_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'TRANSFER_REQUEST_NOT_FOUND';
  end if;
  if v_request.status <> 'pending' then
    raise exception using errcode = 'P0001', message = 'TRANSFER_REQUEST_ALREADY_REVIEWED';
  end if;

  update public.transfer_requests
  set status = p_decision
  where id = p_transfer_id
  returning pg_catalog.to_jsonb(transfer_requests) into v_request_after;

  if p_decision = 'confirmed' then
    select * into v_member
    from public.members
    where id = v_request.member_id
    for update;

    select duration_days into v_duration
    from public.plans
    where id = v_request.plan_id;
    if v_member.id is null or v_duration is null then
      raise exception using errcode = 'P0002', message = 'MEMBER_OR_PLAN_NOT_FOUND';
    end if;

    insert into public.payments (
      member_id,
      plan_id,
      transfer_request_id,
      amount,
      paid_at,
      status
    ) values (
      v_request.member_id,
      v_request.plan_id,
      v_request.id,
      v_request.amount,
      coalesce(v_request.transferred_at, p_now),
      'confirmed'
    );

    update public.members
    set current_plan_id = v_request.plan_id,
        plan_started_at = coalesce(v_member.plan_started_at, p_now),
        plan_expires_at = greatest(
          p_now,
          coalesce(v_member.plan_expires_at, p_now)
        ) + pg_catalog.make_interval(days => v_duration),
        is_lifetime = false,
        auto_renew = false
    where id = v_request.member_id
    returning pg_catalog.to_jsonb(members) into v_member_after;

    insert into public.audit_logs (
      admin_id,
      admin,
      operation_type,
      target_table,
      target_id,
      content,
      before_data,
      after_data
    ) values (
      p_actor_id,
      p_actor_name,
      '修改',
      'members',
      v_request.member_id::text,
      '手動轉帳確認並開通或續訂方案',
      pg_catalog.to_jsonb(v_member),
      v_member_after
    );
  end if;

  insert into public.audit_logs (
    admin_id,
    admin,
    operation_type,
    target_table,
    target_id,
    content,
    before_data,
    after_data
  ) values (
    p_actor_id,
    p_actor_name,
    '審核',
    'transfer_requests',
    p_transfer_id::text,
    case when p_decision = 'confirmed' then '確認轉帳申請' else '拒絕轉帳申請' end,
    pg_catalog.to_jsonb(v_request),
    v_request_after
  );

  return v_request_after;
end;
$$;

revoke all on function public.admin_review_transfer_request(
  uuid,
  text,
  timestamp with time zone,
  uuid,
  text
) from public, anon, authenticated;
grant execute on function public.admin_review_transfer_request(
  uuid,
  text,
  timestamp with time zone,
  uuid,
  text
) to service_role;

create or replace function public.generate_activation_code_batch(
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
  if auth.role() is distinct from 'service_role' then
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
