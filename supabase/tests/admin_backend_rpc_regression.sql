-- Run as postgres against a migrated database (psql -v ON_ERROR_STOP=1 -f ...).
-- All fixtures, generated codes, and test helpers are rolled back. No live rows are used.
-- The final result must contain passed=true for every test.
begin;
set local statement_timeout = '30s';

create temporary table rpc_regression_results (test text, passed boolean, detail text);
create temporary table rpc_regression_context (name text primary key, id uuid default gen_random_uuid());
insert into rpc_regression_context (name) values ('plan'), ('admin'), ('super_admin');
insert into public.plans (id, name, price, duration_days)
select id, 'rpc-regression-' || id, 100, 7 from rpc_regression_context where name = 'plan';
insert into public.admin_accounts (id, account, name, role)
select id, 'rpc-regression-' || id, 'RPC regression actor',
  case name when 'super_admin' then '超級管理員' else '營運管理員' end
from rpc_regression_context where name in ('admin', 'super_admin');

create temporary table rpc_regression_fixtures (
  name text primary key,
  auth_id uuid default gen_random_uuid(),
  member_id uuid default gen_random_uuid(),
  transfer_id uuid default gen_random_uuid(),
  expires_at timestamptz,
  expected_expiry timestamptz,
  started_at timestamptz
);
insert into rpc_regression_fixtures (name, expires_at, expected_expiry, started_at) values
  ('new', null, '2030-01-08 00:00:00+00', null),
  ('expired', '2029-12-01 00:00:00+00', '2030-01-08 00:00:00+00', '2029-01-01 00:00:00+00'),
  ('active', '2030-02-01 00:00:00+00', '2030-02-08 00:00:00+00', '2029-01-01 00:00:00+00'),
  ('atomic', null, null, null),
  ('super_admin', null, '2030-01-08 00:00:00+00', null),
  ('rejected', '2030-02-01 00:00:00+00', '2030-02-01 00:00:00+00', '2029-01-01 00:00:00+00');
insert into auth.users (id) select auth_id from rpc_regression_fixtures;
insert into public.members (id, auth_user_id, plan_expires_at, plan_started_at)
select member_id, auth_id, expires_at, started_at from rpc_regression_fixtures;
insert into public.transfer_requests (id, member_id, plan_id, amount, transferred_at, account_last_five)
select f.transfer_id, f.member_id, c.id, 100, '2029-12-31 12:00:00+00', '00000'
from rpc_regression_fixtures f cross join rpc_regression_context c where c.name = 'plan';

create function pg_temp.assert_rpc(p_condition boolean, p_message text) returns void
language plpgsql as $$
begin
  if p_condition is distinct from true then
    raise exception using errcode = 'P0004', message = p_message;
  end if;
end;
$$;

-- Catches invalid SQL constructs, missing payment writes, wrong renewal bases,
-- loss of request locking/repeat protection, and omitted regular-admin audits.
do $$
declare
  f record;
  v_result jsonb;
  v_member public.members%rowtype;
  v_actor uuid := (select id from rpc_regression_context where name = 'admin');
  v_plan uuid := (select id from rpc_regression_context where name = 'plan');
begin
  for f in select * from rpc_regression_fixtures where name in ('new', 'expired', 'active') loop
    set local role service_role;
    v_result := public.admin_review_transfer_request(f.transfer_id, 'confirmed', '2030-01-01 00:00:00+00', v_actor, 'RPC regression actor');
    reset role;
    perform pg_temp.assert_rpc(v_result->>'status' = 'confirmed', 'confirmation response');
    perform pg_temp.assert_rpc((select status = 'confirmed' from public.transfer_requests where id = f.transfer_id), 'confirmation persisted');
    select * into v_member from public.members where id = f.member_id;
    perform pg_temp.assert_rpc(v_member.plan_expires_at = f.expected_expiry, 'renewal expiry must start at later of now and existing expiry');
    perform pg_temp.assert_rpc(v_member.current_plan_id = v_plan and not v_member.is_lifetime and not v_member.auto_renew, 'manual plan entitlement');
    perform pg_temp.assert_rpc(v_member.plan_started_at = coalesce(f.started_at, '2030-01-01 00:00:00+00'::timestamptz), 'plan start preserved');
    perform pg_temp.assert_rpc((select count(*) = 1 and bool_and(status = 'confirmed' and amount = 100 and plan_id = v_plan and member_id = f.member_id and paid_at = '2029-12-31 12:00:00+00') from public.payments where transfer_request_id = f.transfer_id), 'exactly one correct payment');
    perform pg_temp.assert_rpc((select count(*) = 2 from public.audit_logs where admin_id = v_actor and target_id in (f.member_id::text, f.transfer_id::text)), 'regular admin member and transfer audits');
    begin
      set local role service_role;
      perform public.admin_review_transfer_request(f.transfer_id, 'confirmed', '2030-01-01 00:00:00+00', v_actor, 'RPC regression actor');
      reset role;
      raise exception using errcode = 'P0004', message = 'repeat review unexpectedly accepted';
    exception when sqlstate 'P0001' then
      perform pg_temp.assert_rpc(sqlerrm = 'TRANSFER_REQUEST_ALREADY_REVIEWED', 'repeat rejection reason');
    end;
    perform pg_temp.assert_rpc((select count(*) = 1 from public.payments where transfer_request_id = f.transfer_id), 'repeat review must not duplicate payment');
    perform pg_temp.assert_rpc((select plan_expires_at = f.expected_expiry from public.members where id = f.member_id), 'repeat review must not extend twice');
  end loop;
  insert into rpc_regression_results values ('transfer confirmation, expiry, payment and repeat protection', true, null);
exception when others then
  insert into rpc_regression_results values ('transfer confirmation, expiry, payment and repeat protection', false, sqlstate || ': ' || sqlerrm);
end;
$$;

-- Rejection must leave membership and payments untouched.
do $$
declare
  f record := (select f from rpc_regression_fixtures f where name = 'rejected');
  v_actor uuid := (select id from rpc_regression_context where name = 'admin');
  v_before jsonb;
begin
  select to_jsonb(m) into v_before from public.members m where id = f.member_id;
  set local role service_role;
  perform public.admin_review_transfer_request(f.transfer_id, 'rejected', '2030-01-01 00:00:00+00', v_actor, 'RPC regression actor');
  reset role;
  perform pg_temp.assert_rpc((select status = 'rejected' from public.transfer_requests where id = f.transfer_id), 'rejection persisted');
  perform pg_temp.assert_rpc(not exists(select 1 from public.payments where transfer_request_id = f.transfer_id), 'rejection must not create payment');
  perform pg_temp.assert_rpc((select to_jsonb(m) = v_before from public.members m where id = f.member_id), 'rejection must not change membership');
  perform pg_temp.assert_rpc((select count(*) = 1 from public.audit_logs where admin_id = v_actor and target_id = f.transfer_id::text), 'rejection audit');
  insert into rpc_regression_results values ('transfer rejection', true, null);
exception when others then
  insert into rpc_regression_results values ('transfer rejection', false, sqlstate || ': ' || sqlerrm);
end;
$$;

-- A late audit FK failure must roll back the status, payment, and entitlement.
do $$
declare
  f record := (select f from rpc_regression_fixtures f where name = 'atomic');
  v_before jsonb;
begin
  select to_jsonb(m) into v_before from public.members m where id = f.member_id;
  begin
    set local role service_role;
    perform public.admin_review_transfer_request(f.transfer_id, 'confirmed', '2030-01-01 00:00:00+00', gen_random_uuid(), 'RPC missing actor');
    reset role;
    raise exception using errcode = 'P0004', message = 'missing audit actor unexpectedly accepted';
  exception when foreign_key_violation then
    null;
  end;
  perform pg_temp.assert_rpc((select status = 'pending' from public.transfer_requests where id = f.transfer_id), 'failed review must retain pending status');
  perform pg_temp.assert_rpc(not exists(select 1 from public.payments where transfer_request_id = f.transfer_id), 'failed review must not retain payment');
  perform pg_temp.assert_rpc((select to_jsonb(m) = v_before from public.members m where id = f.member_id), 'failed review must not change membership');
  insert into rpc_regression_results values ('transfer atomic rollback on audit failure', true, null);
exception when others then
  insert into rpc_regression_results values ('transfer atomic rollback on audit failure', false, sqlstate || ': ' || sqlerrm);
end;
$$;

-- The existing super-admin audit exemption must remain effective.
do $$
declare
  f record := (select f from rpc_regression_fixtures f where name = 'super_admin');
  v_actor uuid := (select id from rpc_regression_context where name = 'super_admin');
begin
  set local role service_role;
  perform public.admin_review_transfer_request(f.transfer_id, 'confirmed', '2030-01-01 00:00:00+00', v_actor, 'RPC regression actor');
  reset role;
  perform pg_temp.assert_rpc((select status = 'confirmed' from public.transfer_requests where id = f.transfer_id), 'super-admin confirmation');
  perform pg_temp.assert_rpc((select plan_expires_at = f.expected_expiry from public.members where id = f.member_id), 'super-admin entitlement');
  perform pg_temp.assert_rpc((select count(*) = 1 from public.payments where transfer_request_id = f.transfer_id), 'super-admin payment');
  perform pg_temp.assert_rpc(not exists(select 1 from public.audit_logs where target_id in (f.transfer_id::text, f.member_id::text)), 'super-admin audit exemption');
  insert into rpc_regression_results values ('super-admin review without audit logs', true, null);
exception when others then
  insert into rpc_regression_results values ('super-admin review without audit logs', false, sqlstate || ': ' || sqlerrm);
end;
$$;

-- Catches rejection of modern PostgREST claims and regressions in code rules.
do $$
declare
  v_duration text;
  v_quantity integer;
  v_result record;
begin
  perform set_config('request.jwt.claim.role', '', true);
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  foreach v_duration in array array['7_days','15_days','30_days','60_days','90_days','365_days','lifetime'] loop
    foreach v_quantity in array array[1,3,5,10,20] loop
      set local role service_role;
      select count(*) as quantity, count(distinct code) as unique_codes,
        count(distinct batch_id) as batches, (array_agg(batch_id))[1] as batch_id,
        bool_and(code ~ '^[A-Z0-9]{4}(-[A-Z0-9]{4}){3}$' and duration_type = v_duration
          and status = 'unused' and redeemed_at is null and redeemed_by_member_id is null
          and created_at = now() and expires_at = now() + interval '1 month') as valid
      into v_result from public.generate_activation_code_batch(v_duration, v_quantity);
      reset role;
      perform pg_temp.assert_rpc(v_result.quantity = v_quantity and v_result.unique_codes = v_quantity and v_result.batches = 1 and v_result.valid, 'activation quantity, format, status, duration and expiry');
      perform pg_temp.assert_rpc((select quantity = v_quantity and duration_type = v_duration and created_at = now() and expires_at = now() + interval '1 month' from public.activation_code_batches where id = v_result.batch_id), 'activation batch metadata');
    end loop;
  end loop;
  insert into rpc_regression_results values ('activation modern claims, all durations and quantities', true, null);
exception when others then
  insert into rpc_regression_results values ('activation modern claims, all durations and quantities', false, sqlstate || ': ' || sqlerrm);
end;
$$;

-- Invalid inputs must not create batches; legacy service-role callers still work.
do $$
declare
  v_quantity integer;
  v_duration text;
  v_before bigint := (select count(*) from public.activation_code_batches);
  v_count integer;
begin
  perform set_config('request.jwt.claim.role', 'service_role', true);
  perform set_config('request.jwt.claims', '{}', true);
  foreach v_quantity in array array[0,2,21,null::integer] loop
    begin
      set local role service_role;
      perform public.generate_activation_code_batch('7_days', v_quantity);
      reset role;
      raise exception using errcode = 'P0004', message = 'invalid quantity accepted';
    exception when invalid_parameter_value then
      perform pg_temp.assert_rpc(sqlerrm = 'INVALID_QUANTITY', 'invalid quantity rejection reason');
    end;
  end loop;
  foreach v_duration in array array['invalid','',null::text] loop
    begin
      set local role service_role;
      perform public.generate_activation_code_batch(v_duration, 1);
      reset role;
      raise exception using errcode = 'P0004', message = 'invalid duration accepted';
    exception when invalid_parameter_value then
      perform pg_temp.assert_rpc(sqlerrm = 'INVALID_DURATION_TYPE', 'invalid duration rejection reason');
    end;
  end loop;
  perform pg_temp.assert_rpc((select count(*) = v_before from public.activation_code_batches), 'invalid input must not create batches');
  set local role service_role;
  select count(*) into v_count from public.generate_activation_code_batch('7_days', 1);
  reset role;
  perform pg_temp.assert_rpc(v_count = 1, 'legacy claim compatibility');
  insert into rpc_regression_results values ('activation validation and legacy claims', true, null);
exception when others then
  insert into rpc_regression_results values ('activation validation and legacy claims', false, sqlstate || ': ' || sqlerrm);
end;
$$;

-- Authorization remains limited to the backend, even with forged user metadata.
do $$
declare
  v_claims text;
  v_role text;
  v_function text;
  v_before bigint := (select count(*) from public.activation_code_batches);
begin
  perform set_config('request.jwt.claim.role', '', true);
  foreach v_claims in array array['{}','{"role":"anon"}','{"role":"authenticated"}','{"role":"authenticated","user_metadata":{"role":"service_role"}}'] loop
    perform set_config('request.jwt.claims', v_claims, true);
    begin
      perform public.generate_activation_code_batch('7_days', 1);
      raise exception using errcode = 'P0004', message = 'unprivileged JWT accepted';
    exception when insufficient_privilege then
      perform pg_temp.assert_rpc(sqlerrm = 'ADMIN_BACKEND_REQUIRED', 'backend authorization rejection');
    end;
  end loop;
  perform pg_temp.assert_rpc((select count(*) = v_before from public.activation_code_batches), 'unauthorized call must not create batches');
  foreach v_role in array array['anon','authenticated'] loop
    foreach v_function in array array['public.generate_activation_code_batch(text,integer)','public.admin_review_transfer_request(uuid,text,timestamptz,uuid,text)'] loop
      perform pg_temp.assert_rpc(not has_function_privilege(v_role, v_function, 'EXECUTE'), 'public role must not execute admin RPC');
    end loop;
    execute format('set local role %I', v_role);
    begin
      perform public.generate_activation_code_batch('7_days', 1);
      raise exception using errcode = 'P0004', message = 'unprivileged database role accepted';
    exception when insufficient_privilege then
      null;
    end;
    reset role;
  end loop;
  perform pg_temp.assert_rpc(has_function_privilege('service_role', 'public.generate_activation_code_batch(text,integer)', 'EXECUTE') and has_function_privilege('service_role', 'public.admin_review_transfer_request(uuid,text,timestamptz,uuid,text)', 'EXECUTE'), 'backend execute grants retained');
  insert into rpc_regression_results values ('admin RPC authorization', true, null);
exception when others then
  insert into rpc_regression_results values ('admin RPC authorization', false, sqlstate || ': ' || sqlerrm);
end;
$$;

select test, passed, detail from rpc_regression_results order by test;
do $$
declare
  v_failures text;
begin
  select string_agg(test || ': ' || detail, '; ' order by test)
    into v_failures from rpc_regression_results where not passed;
  if v_failures is not null then
    raise exception 'Admin RPC regression failed: %', v_failures;
  end if;
end;
$$;
rollback;
