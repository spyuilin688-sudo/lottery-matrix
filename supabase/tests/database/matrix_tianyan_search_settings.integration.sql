-- Requires an existing eligible member and completed 天天樂 artifact. Rolls back session context.
begin;

do $verify$
declare
 uid uuid;
 req jsonb;
 result jsonb;
 payload jsonb;
 periods integer;
 search_range text;
 ordering text;
 expected_count integer;
 actual_count integer;
 checks integer := 0;
begin
 select m.auth_user_id into uid from public.members m left join public.plans p on p.id=m.current_plan_id
 where m.auth_user_id is not null and m.status not in ('停用','disabled','inactive')
 and (m.is_lifetime or (p.name in ('季費方案','年費方案') and m.plan_expires_at > now())) limit 1;
 if uid is null then raise exception 'No eligible member for verification'; end if;
 perform set_config('request.jwt.claim.sub',uid::text,true);
 foreach periods in array array[2,7,13] loop
 foreach search_range in array array['標準範圍','完整範圍'] loop
 foreach ordering in array array['依號碼由小到大排序','依實際開獎順序排序'] loop
 req := jsonb_build_object('lottery','天天樂','explorePeriods',periods,'exploreRange',search_range,
 'numberOrder',ordering,'selectedStreaks',(select jsonb_agg('準'||n||'進'||(n+1)) from generate_series(4,30) n),'sameCode',false);
 result := public.matrix_tianyan_list(req);
 payload := private.matrix_artifact_payload('tianyan','天天樂',result->>'drawPeriod',result->>'analysisVersion');
 select count(*) into expected_count from jsonb_array_elements(payload->'items') item
 where item->>'numberOrder'=ordering and (item->>'lockedSourceIndex')::int between 0 and periods-1
 and jsonb_array_length(payload->'validationById'->(item->>'id')->'rules')=2
 and (select bool_and(coalesce((rule->>'referenceOffset')::int,(rule->>'validationPeriodOffset')::int)
 between case when search_range='標準範圍' then -7 else -14 end and (item->>'predictionDistance')::int-1)
 from jsonb_array_elements(payload->'validationById'->(item->>'id')->'rules') rule);
 actual_count := (result->>'total')::int;
 if actual_count <> expected_count then raise exception 'Count mismatch %, %, %: % vs %',periods,search_range,ordering,actual_count,expected_count; end if;
 if exists (select 1 from jsonb_array_elements(result->'items') item where (item->>'explorePeriods')::int <> periods) then raise exception 'Wrong response periods'; end if;
 if exists (
 select 1 from jsonb_array_elements(result->'duplicateStats') stat
 where (stat->>'count')::int <> (select count(*) from jsonb_array_elements(result->'items') item where item->'predictionNumbers' ? (stat->>'number'))
 ) then raise exception 'Wrong duplicate stats'; end if;
 checks:=checks+1;
 end loop; end loop; end loop;
 begin
 perform public.matrix_tianyan_list(req || '{"explorePeriods":5}'::jsonb);
 raise exception 'Accepted invalid periods';
 exception when invalid_parameter_value then null; end;
 perform set_config('request.jwt.claim.sub','',true);
 begin
 perform public.matrix_tianyan_list(req);
 raise exception 'Accepted guest';
 exception when insufficient_privilege then null; end;
 raise notice 'Passed % combinations plus invalid period and guest checks',checks;
end;
$verify$;
select 'passed: 12 period/range/order combinations, duplicate stats, invalid periods, guest denial' as verification;

rollback;

