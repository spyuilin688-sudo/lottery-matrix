-- Run only this file after the V2 migration in a local PostgreSQL database.
-- The entitlement stub, generated member fixtures and assertions all roll back.
begin;

create function pg_temp.custom_fixture(p_row jsonb default null)
returns jsonb language sql as $$
  select jsonb_build_object(
    'schemaVersion', 2, 'lottery', '今彩539', 'status', 'ACTIVE',
    'explorePeriods', 13, 'exploreRange', '完整範圍',
    'oneCodeGroups', jsonb_build_array(jsonb_build_object(
      'id', 'one-1', 'rows', jsonb_build_array(coalesce(p_row, '{
        "consecutiveMin":5,"consecutiveMax":6,"roadTypes":["加減","合值"],
        "roadRelation":"any","numberOrder":"依號碼由小到大排序",
        "sameCodeMin":2,"sameCodeMax":4
      }'::jsonb))
    )), 'twoCodeGroups', '[]'::jsonb
  );
$$;

create function pg_temp.expect_custom_rejected(p_config jsonb, p_expected_state text default '22023', p_composite boolean default true)
returns void language plpgsql as $$
declare v_state text;
begin
  begin
    perform private.matrix_custom_status_normalize_config(p_config, p_composite);
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate;
    if v_state <> p_expected_state then
      raise exception 'Expected SQLSTATE %, received % for %', p_expected_state, v_state, p_config;
    end if;
    return;
  end;
  raise exception 'Expected SQLSTATE %, but accepted %', p_expected_state, p_config;
end;
$$;

do $$
declare
  v_config jsonb := pg_temp.custom_fixture();
  v_row jsonb := pg_temp.custom_fixture() #> '{oneCodeGroups,0,rows,0}';
  v_legacy jsonb;
  v_normalized jsonb;
  v_group jsonb;
  v_bad jsonb;
  v_field text;
  v_streak integer;
begin
  -- Inclusive finite and unlimited ranges, exact counts, both number orders.
  assert private.matrix_custom_status_normalize_config(v_config, false) = v_config;
  perform private.matrix_custom_status_normalize_config(pg_temp.custom_fixture(v_row || '{"sameCodeMin":7,"sameCodeMax":null}'), false);
  perform private.matrix_custom_status_normalize_config(pg_temp.custom_fixture(v_row || '{"sameCodeMin":1,"sameCodeMax":1,"consecutiveMin":7,"consecutiveMax":7}'), false);
  perform private.matrix_custom_status_normalize_config(pg_temp.custom_fixture(v_row || '{"numberOrder":"依實際開獎順序排序"}'), false);

  -- V1 single streak and minimum count are upgraded without an invented maximum.
  v_legacy := pg_temp.custom_fixture('{"consecutive":"準5進6","roadType":"合值","numberOrder":"依號碼由小到大排序","sameCodeQuantity":3}') - 'schemaVersion';
  v_normalized := private.matrix_custom_status_normalize_config(v_legacy, false);
  assert v_normalized->'schemaVersion' = '2'::jsonb;
  assert v_normalized #> '{oneCodeGroups,0,rows,0}' = '{"consecutiveMin":5,"consecutiveMax":5,"roadTypes":["合值"],"roadRelation":"any","numberOrder":"依號碼由小到大排序","sameCodeMin":3,"sameCodeMax":null}'::jsonb;
  assert private.matrix_custom_status_normalize_config(v_legacy || '{"schemaVersion":1}', false) = v_normalized;

  -- Existing permitted streak endpoints remain unchanged for each code type.
  foreach v_streak in array array[4,5,6,7] loop
    perform private.matrix_custom_status_normalize_config(pg_temp.custom_fixture(v_row || jsonb_build_object('consecutiveMin',v_streak,'consecutiveMax',v_streak)), false);
  end loop;
  foreach v_streak in array array[5,6,7,9,11] loop
    v_group := jsonb_build_object('id','two-1','rows',jsonb_build_array(v_row || jsonb_build_object('consecutiveMin',v_streak,'consecutiveMax',v_streak)));
    perform private.matrix_custom_status_normalize_config(v_config || jsonb_build_object('oneCodeGroups','[]'::jsonb,'twoCodeGroups',jsonb_build_array(v_group)), false);
  end loop;
  perform pg_temp.expect_custom_rejected(pg_temp.custom_fixture(v_row || '{"consecutiveMax":9}'));
  perform pg_temp.expect_custom_rejected(v_config || jsonb_build_object('oneCodeGroups','[]'::jsonb,'twoCodeGroups',jsonb_build_array(jsonb_build_object('id','two','rows',jsonb_build_array(v_row || '{"consecutiveMax":8}')))));

  -- AND rows stay in their group; OR groups stay separate with unique IDs.
  v_group := jsonb_build_object('id','and-group','rows',jsonb_build_array(v_row,v_row || '{"sameCodeMin":5,"sameCodeMax":6}'));
  perform private.matrix_custom_status_normalize_config(v_config || jsonb_build_object('oneCodeGroups',jsonb_build_array(v_group, v_group || '{"id":"or-group"}')), false);

  -- All root/row required fields reject SQL NULL, JSON null, wrong type or absence.
  perform pg_temp.expect_custom_rejected(null);
  perform pg_temp.expect_custom_rejected('null');
  perform pg_temp.expect_custom_rejected('[]');
  foreach v_field in array array['lottery','status','explorePeriods','exploreRange','oneCodeGroups','twoCodeGroups'] loop
    perform pg_temp.expect_custom_rejected(v_config - v_field);
    perform pg_temp.expect_custom_rejected(v_config || jsonb_build_object(v_field,null));
  end loop;
  foreach v_field in array array['consecutiveMin','consecutiveMax','roadTypes','roadRelation','numberOrder','sameCodeMin','sameCodeMax'] loop
    perform pg_temp.expect_custom_rejected(pg_temp.custom_fixture(v_row - v_field));
    if v_field <> 'sameCodeMax' then
      perform pg_temp.expect_custom_rejected(pg_temp.custom_fixture(v_row || jsonb_build_object(v_field,null)));
    end if;
  end loop;
  perform pg_temp.expect_custom_rejected(v_config || '{"schemaVersion":3}');
  perform pg_temp.expect_custom_rejected(v_config || '{"schemaVersion":"2"}');
  perform pg_temp.expect_custom_rejected(v_config || '{"explorePeriods":"13"}');
  perform pg_temp.expect_custom_rejected(v_config || '{"status":"DORMANT"}');
  perform pg_temp.expect_custom_rejected(v_config || '{"lottery":"其他"}');
  perform pg_temp.expect_custom_rejected(v_config || '{"exploreRange":"標準範圍"}');
  perform pg_temp.expect_custom_rejected(v_config || '{"oneCodeGroups":[null]}');
  perform pg_temp.expect_custom_rejected(v_config || '{"oneCodeGroups":[{"id":"bad","rows":[null]}]}');

  -- Count bounds are integer 1..99 and ordered; streak endpoints must be ordered.
  for v_bad in select value from jsonb_array_elements('[{"sameCodeMin":0},{"sameCodeMin":1.5},{"sameCodeMin":"2"},{"sameCodeMin":100},{"sameCodeMax":0},{"sameCodeMax":3.5},{"sameCodeMax":"4"},{"sameCodeMax":100},{"sameCodeMin":5,"sameCodeMax":4},{"consecutiveMin":6,"consecutiveMax":5},{"consecutiveMin":"5"},{"consecutiveMax":5.5},{"roadTypes":[]},{"roadTypes":["加減","加減"]},{"roadTypes":["其他"]},{"roadTypes":[null]},{"roadRelation":"OR"},{"numberOrder":"順球"}]') loop
    perform pg_temp.expect_custom_rejected(pg_temp.custom_fixture(v_row || v_bad));
  end loop;

  -- Limits remain 20 groups per type and 1..10 rows per group.
  v_group := jsonb_build_object('id','group','rows','[]'::jsonb);
  perform pg_temp.expect_custom_rejected(v_config || jsonb_build_object('oneCodeGroups',jsonb_build_array(v_group)));
  select jsonb_agg(jsonb_build_object('id','group-' || n,'rows',jsonb_build_array(v_row))) into v_bad from generate_series(1,20) n;
  perform private.matrix_custom_status_normalize_config(v_config || jsonb_build_object('oneCodeGroups',v_bad), false);
  perform pg_temp.expect_custom_rejected(v_config || jsonb_build_object('oneCodeGroups',v_bad || jsonb_build_array(v_group)));
  select jsonb_agg(v_row || jsonb_build_object('sameCodeMin',n,'sameCodeMax',null)) into v_bad from generate_series(1,10) n;
  perform private.matrix_custom_status_normalize_config(v_config || jsonb_build_object('oneCodeGroups',jsonb_build_array(v_group || jsonb_build_object('rows',v_bad))), false);
  perform pg_temp.expect_custom_rejected(v_config || jsonb_build_object('oneCodeGroups',jsonb_build_array(v_group || jsonb_build_object('rows',v_bad || jsonb_build_array(v_row)))));

  -- Duplicate rows canonicalize road type order; group IDs are unique across sections.
  perform pg_temp.expect_custom_rejected(v_config || jsonb_build_object('oneCodeGroups',jsonb_build_array(v_group || jsonb_build_object('rows',jsonb_build_array(v_row,v_row || '{"roadTypes":["合值","加減"]}')))));
  perform pg_temp.expect_custom_rejected(v_config || jsonb_build_object('twoCodeGroups',v_config->'oneCodeGroups'));
  perform pg_temp.expect_custom_rejected(jsonb_set(v_config,'{oneCodeGroups,0,id}','" "'));

  -- Alternative road pairs are retained as alternatives, never three summed road types.
  v_bad := v_row || '{"roadTypes":["加減","合值","拖牌"],"roadRelation":"all","roadTypeAlternatives":[["加減","拖牌"],["合值","拖牌"]]}';
  v_normalized := private.matrix_custom_status_normalize_config(pg_temp.custom_fixture(v_bad), false);
  assert v_normalized #> '{oneCodeGroups,0,rows,0,roadTypeAlternatives}' = v_bad->'roadTypeAlternatives';
  perform pg_temp.expect_custom_rejected(pg_temp.custom_fixture(v_bad || '{"roadRelation":"any"}'));
  perform pg_temp.expect_custom_rejected(pg_temp.custom_fixture(v_bad || '{"roadTypeAlternatives":[]}'));
  perform pg_temp.expect_custom_rejected(pg_temp.custom_fixture(v_bad || '{"roadTypeAlternatives":[[]]}'));
  perform pg_temp.expect_custom_rejected(pg_temp.custom_fixture(v_bad || '{"roadTypeAlternatives":[["加減","拖牌"],["拖牌","加減"]]}'));
  perform pg_temp.expect_custom_rejected(pg_temp.custom_fixture(v_bad || '{"roadTypeAlternatives":[["加減","加減"],["合值","拖牌"]]}'));
  perform pg_temp.expect_custom_rejected(pg_temp.custom_fixture(v_bad || '{"roadTypeAlternatives":[["加減","拖牌"]]}'));
  perform pg_temp.expect_custom_rejected(pg_temp.custom_fixture(v_bad || '{"roadTypeAlternatives":[["其他","拖牌"],["合值","拖牌"]]}'));

  -- Composite entitlement applies to V1, V2 roadTypes, and every alternative.
  perform pg_temp.expect_custom_rejected(pg_temp.custom_fixture(v_row || '{"roadTypes":["複合"]}'), '42501', false);
  perform pg_temp.expect_custom_rejected(jsonb_set(v_legacy,'{oneCodeGroups,0,rows,0,roadType}','"複合"'), '42501', false);
  perform pg_temp.expect_custom_rejected(pg_temp.custom_fixture(v_bad || '{"roadTypeAlternatives":[["加減","拖牌"],["複合","拖牌"]]}'), '42501', false);
  perform pg_temp.expect_custom_rejected(pg_temp.custom_fixture(v_row || '{"roadTypes":["複合"]}'), '42501', null);
  perform private.matrix_custom_status_normalize_config(pg_temp.custom_fixture(v_row || '{"roadTypes":["複合"]}'), true);

  -- Pure helper is inaccessible from client roles; save stays authenticated only.
  assert not has_function_privilege('anon','private.matrix_custom_status_normalize_config(jsonb,boolean)','EXECUTE');
  assert not has_function_privilege('authenticated','private.matrix_custom_status_normalize_config(jsonb,boolean)','EXECUTE');
  assert not has_function_privilege('anon','public.matrix_custom_status_save(jsonb)','EXECUTE');
  assert has_function_privilege('authenticated','public.matrix_custom_status_save(jsonb)','EXECUTE');
  raise notice 'matrix_custom_status_v2: all normalization, validation and grants assertions passed';
end;
$$;

-- Isolate the save RPC's own entitlement gate from the subscription evaluator.
-- This replacement is transactional and must only run against a local test DB.
create or replace function private.matrix_result_entitlements()
returns jsonb language sql stable security definer set search_path = '' as $$
  select nullif(pg_catalog.current_setting('matrix.test_entitlements', true), '')::jsonb;
$$;

create function pg_temp.expect_custom_save_rejected(p_config jsonb, p_expected_state text default '42501')
returns void language plpgsql as $$
declare v_state text;
begin
  begin
    perform public.matrix_custom_status_save(p_config);
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate;
    if v_state <> p_expected_state then
      raise exception 'Expected save SQLSTATE %, received %', p_expected_state, v_state;
    end if;
    return;
  end;
  raise exception 'Expected save SQLSTATE %, but save succeeded', p_expected_state;
end;
$$;

do $$
declare
  v_user_a uuid := gen_random_uuid();
  v_user_b uuid := gen_random_uuid();
  v_member_a uuid := gen_random_uuid();
  v_member_b uuid := gen_random_uuid();
  v_config jsonb := pg_temp.custom_fixture();
  v_legacy jsonb := pg_temp.custom_fixture('{"consecutive":"準5進6","roadType":"加減","numberOrder":"依號碼由小到大排序","sameCodeQuantity":3}') - 'schemaVersion';
  v_saved jsonb;
begin
  insert into auth.users(id) values (v_user_a),(v_user_b);
  insert into public.members(id,auth_user_id,is_lifetime) values (v_member_a,v_user_a,true),(v_member_b,v_user_b,true);
  insert into public.matrix_custom_status_configs(member_id,lottery,status,config)
  values (v_member_b,'今彩539','ACTIVE',v_legacy);

  perform set_config('request.jwt.claim.sub','',true);
  perform set_config('request.jwt.claims','{}',true);
  perform set_config('matrix.test_entitlements','{"canCustomizeStatus":true,"canUseCompositeCustomRoad":true}',true);
  perform pg_temp.expect_custom_save_rejected(v_config);

  -- A signed-in user without a member row cannot save.
  perform set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
  perform pg_temp.expect_custom_save_rejected(v_config);
  perform set_config('request.jwt.claim.sub',v_user_a::text,true);
  perform set_config('matrix.test_entitlements','{"canCustomizeStatus":false}',true);
  perform pg_temp.expect_custom_save_rejected(v_config);
  perform set_config('matrix.test_entitlements','{}',true);
  perform pg_temp.expect_custom_save_rejected(v_config);
  perform set_config('matrix.test_entitlements','{"canCustomizeStatus":null}',true);
  perform pg_temp.expect_custom_save_rejected(v_config);

  perform set_config('matrix.test_entitlements','{"canCustomizeStatus":true,"canUseCompositeCustomRoad":false}',true);
  perform pg_temp.expect_custom_save_rejected(jsonb_set(v_config,'{oneCodeGroups,0,rows,0,roadTypes}','["複合"]'));
  perform pg_temp.expect_custom_save_rejected(jsonb_set(v_config,'{oneCodeGroups,0,rows,0,sameCodeMax}','1'),'22023');
  assert not exists(select 1 from public.matrix_custom_status_configs where member_id = v_member_a);

  -- Payload-supplied member identity cannot alter the authenticated owner.
  v_saved := public.matrix_custom_status_save(v_config || jsonb_build_object('member_id',v_member_b));
  assert v_saved->'item'->'schemaVersion' = '2'::jsonb;
  assert (select config->'schemaVersion' from public.matrix_custom_status_configs where member_id=v_member_a and lottery='今彩539' and status='ACTIVE') = '2'::jsonb;
  assert (select config from public.matrix_custom_status_configs where member_id=v_member_b and lottery='今彩539' and status='ACTIVE') = v_legacy;

  -- Saving legacy input upgrades only the requesting member's selected slot.
  v_saved := public.matrix_custom_status_save(v_legacy);
  assert v_saved #> '{item,oneCodeGroups,0,rows,0,sameCodeMin}' = '3'::jsonb;
  assert v_saved #> '{item,oneCodeGroups,0,rows,0,sameCodeMax}' = 'null'::jsonb;
  assert (select count(*) from public.matrix_custom_status_configs where member_id=v_member_a) = 1;
  assert (select config from public.matrix_custom_status_configs where member_id=v_member_b and lottery='今彩539' and status='ACTIVE') = v_legacy;
  raise notice 'matrix_custom_status_v2: all RPC authentication, entitlement, ownership and persistence assertions passed';
end;
$$;

rollback;
