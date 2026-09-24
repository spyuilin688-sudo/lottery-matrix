begin;

create table private.admin_test_push_requests (
  request_id uuid primary key,
  user_id uuid not null,
  admin_id uuid not null,
  state text not null default 'pending' check (state in ('pending', 'completed')),
  result jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint admin_test_push_result_state check (
    (state = 'pending' and result is null and completed_at is null)
    or (state = 'completed' and result is not null and completed_at is not null)
  )
);

alter table private.admin_test_push_requests enable row level security;
revoke all on private.admin_test_push_requests from public, anon, authenticated;
grant usage on schema private to service_role;
grant select, insert, update on private.admin_test_push_requests to service_role;

create function public.admin_claim_test_push(
  p_request_id uuid, p_user_id uuid, p_admin_id uuid
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_request private.admin_test_push_requests%rowtype;
  v_claimed boolean := false;
begin
  if coalesce(
    nullif(pg_catalog.current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
    pg_catalog.current_setting('request.jwt.claim.role', true), ''
  ) <> 'service_role' then
    raise exception using errcode = '42501', message = 'ADMIN_BACKEND_REQUIRED';
  end if;
  if p_request_id is null or p_user_id is null or p_admin_id is null then
    raise exception using errcode = '22023', message = 'INVALID_TEST_PUSH_REQUEST';
  end if;
  if not exists (
    select 1 from public.admin_accounts
    where id = p_admin_id and status = '啟用'
  ) then
    raise exception using errcode = '42501', message = 'ADMIN_ACTOR_NOT_FOUND';
  end if;

  insert into private.admin_test_push_requests(request_id, user_id, admin_id)
  values (p_request_id, p_user_id, p_admin_id)
  on conflict (request_id) do nothing;
  v_claimed := found;
  select * into v_request from private.admin_test_push_requests
  where request_id = p_request_id;
  if v_request.user_id is distinct from p_user_id
     or v_request.admin_id is distinct from p_admin_id then
    raise exception using errcode = 'PT409', message = 'TEST_PUSH_REQUEST_CONFLICT';
  end if;
  if v_claimed then
    return pg_catalog.jsonb_build_object('state', 'claimed');
  end if;
  return pg_catalog.jsonb_build_object(
    'state', v_request.state, 'result', v_request.result
  );
end;
$$;

create function public.admin_finish_test_push(
  p_request_id uuid, p_user_id uuid, p_admin_id uuid, p_result jsonb
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_request private.admin_test_push_requests%rowtype;
begin
  if coalesce(
    nullif(pg_catalog.current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
    pg_catalog.current_setting('request.jwt.claim.role', true), ''
  ) <> 'service_role' then
    raise exception using errcode = '42501', message = 'ADMIN_BACKEND_REQUIRED';
  end if;
  if p_request_id is null or p_user_id is null or p_admin_id is null
     or p_result is null or pg_catalog.jsonb_typeof(p_result) <> 'object'
     or not (
       (p_result ? 'error' and p_result->>'error' in ('NO_ACTIVE_SUBSCRIPTIONS', 'SUBSCRIPTION_LOOKUP_FAILED'))
       or (pg_catalog.jsonb_typeof(p_result->'sent') = 'number'
           and pg_catalog.jsonb_typeof(p_result->'failed') = 'number')
     ) then
    raise exception using errcode = '22023', message = 'INVALID_TEST_PUSH_RESULT';
  end if;
  select * into v_request from private.admin_test_push_requests
  where request_id = p_request_id for update;
  if not found or v_request.user_id is distinct from p_user_id
     or v_request.admin_id is distinct from p_admin_id then
    raise exception using errcode = 'PT409', message = 'TEST_PUSH_REQUEST_CONFLICT';
  end if;
  if v_request.state = 'completed' then
    if v_request.result is distinct from p_result then
      raise exception using errcode = 'PT409', message = 'TEST_PUSH_REQUEST_CONFLICT';
    end if;
    return v_request.result;
  end if;
  update private.admin_test_push_requests
  set state = 'completed', result = p_result, completed_at = now()
  where request_id = p_request_id;
  return p_result;
end;
$$;

revoke all on function public.admin_claim_test_push(uuid,uuid,uuid) from public, anon, authenticated;
revoke all on function public.admin_finish_test_push(uuid,uuid,uuid,jsonb) from public, anon, authenticated;
grant execute on function public.admin_claim_test_push(uuid,uuid,uuid) to service_role;
grant execute on function public.admin_finish_test_push(uuid,uuid,uuid,jsonb) to service_role;

notify pgrst, 'reload schema';
commit;
