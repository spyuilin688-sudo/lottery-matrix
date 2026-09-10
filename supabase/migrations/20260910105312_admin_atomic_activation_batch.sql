-- Apply before deploying the admin backend that calls this RPC.
-- Existing batches retain NULL request identities; new requests are unique.
alter table public.activation_code_batches
  add column request_id uuid unique,
  add column requested_by uuid references public.admin_accounts(id);

create function public.admin_generate_activation_code_batch(
  p_duration_type text,
  p_quantity integer,
  p_actor_id uuid,
  p_request_id uuid
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
  if v_actor.role = '營運管理員' and p_duration_type not in ('7_days','15_days') then
    raise exception using errcode = '42501', message = 'ACTIVATION_DURATION_FORBIDDEN';
  end if;
  -- Serializes concurrent delivery/retry of this operation for the transaction.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_request_id::text, 0));
  select * into v_existing from public.activation_code_batches where request_id = p_request_id;
  if found then
    if v_existing.requested_by is distinct from p_actor_id
       or v_existing.duration_type <> p_duration_type or v_existing.quantity <> p_quantity then
      raise exception using errcode = '22023', message = 'ACTIVATION_REQUEST_CONFLICT';
    end if;
    return pg_catalog.jsonb_build_object('batchId',v_existing.id,'count',v_existing.quantity);
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


  update public.activation_code_batches
  set request_id = p_request_id, requested_by = p_actor_id where id = v_batch_id;
  insert into public.audit_logs(admin_id,admin,operation_type,target_table,target_id,content,after_data)
  values (p_actor_id,coalesce(nullif(v_actor.name,''),v_actor.account),'批次新增','activation_codes',v_batch_id::text,
    '批次建立 ' || p_quantity || ' 組啟動碼',
    pg_catalog.jsonb_build_object('batchId',v_batch_id,'durationType',p_duration_type,'count',p_quantity));
  return pg_catalog.jsonb_build_object('batchId',v_batch_id,'count',p_quantity);
end;
$function$;
revoke all on function public.admin_generate_activation_code_batch(text,integer,uuid,uuid) from public,anon,authenticated;
grant execute on function public.admin_generate_activation_code_batch(text,integer,uuid,uuid) to service_role;
