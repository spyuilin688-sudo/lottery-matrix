create index if not exists admin_login_records_admin_id_idx
  on public.admin_login_records (admin_id);

create index if not exists audit_logs_admin_id_idx
  on public.audit_logs (admin_id);

create or replace function public.generate_activation_code_batch(p_duration_type text)
returns setof public.activation_codes
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_batch_id uuid;
  v_created_at timestamptz := pg_catalog.now();
  v_inserted_count integer := 0;
  v_row_count integer;
  v_raw_code text;
  v_code text;
  v_random_bytes bytea;
begin
  if pg_catalog.coalesce(pg_catalog.current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'ADMIN_BACKEND_REQUIRED';
  end if;

  if p_duration_type is null
     or p_duration_type not in ('7_days', '15_days', '30_days', '90_days', '365_days', 'lifetime') then
    raise exception using errcode = '22023', message = 'INVALID_DURATION_TYPE';
  end if;

  insert into public.activation_code_batches (duration_type, quantity, created_at, expires_at)
  values (p_duration_type, 10, v_created_at, v_created_at + interval '1 month')
  returning id into v_batch_id;

  while v_inserted_count < 10 loop
    v_random_bytes := extensions.gen_random_bytes(16);
    select pg_catalog.string_agg(
      pg_catalog.substr(
        'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
        (pg_catalog.get_byte(v_random_bytes, byte_index) % 36) + 1,
        1
      ),
      '' order by byte_index
    )
    into v_raw_code
    from pg_catalog.generate_series(0, 15) as generated(byte_index);

    v_code := pg_catalog.substr(v_raw_code, 1, 4)
      || '-' || pg_catalog.substr(v_raw_code, 5, 4)
      || '-' || pg_catalog.substr(v_raw_code, 9, 4)
      || '-' || pg_catalog.substr(v_raw_code, 13, 4);

    insert into public.activation_codes (
      batch_id,
      code,
      duration_type,
      created_at,
      expires_at,
      status
    )
    values (
      v_batch_id,
      v_code,
      p_duration_type,
      v_created_at,
      v_created_at + interval '1 month',
      'unused'
    )
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
$$;

revoke execute on function public.generate_activation_code_batch(text)
  from public, anon, authenticated;
grant execute on function public.generate_activation_code_batch(text)
  to service_role;
