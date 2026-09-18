-- Transactional fixture; no real member or provider account is modified.
begin;
do $$
declare
  v_new uuid := extensions.gen_random_uuid();
  v_old uuid := extensions.gen_random_uuid();
  v_non_line uuid := extensions.gen_random_uuid();
  v_member uuid;
  v_started timestamptz;
  v_profile jsonb;
  v_result jsonb;
  v_denied boolean;
begin
  insert into auth.users(id, aud, role) values
    (v_new, 'authenticated', 'authenticated'),
    (v_old, 'authenticated', 'authenticated'),
    (v_non_line, 'authenticated', 'authenticated');

  -- A pre-existing member is not granted a trial when linking LINE later.
  insert into public.members(auth_user_id) values(v_old);
  insert into public.members(auth_user_id, line_trial_started_at)
    values(v_non_line, pg_catalog.now());
  if exists (select 1 from public.members where auth_user_id=v_non_line and line_trial_started_at is not null) then
    raise exception 'Non-LINE member was granted a registration trial';
  end if;

  insert into auth.identities(id,user_id,provider,provider_id,identity_data,created_at,updated_at)
    values(extensions.gen_random_uuid(),v_old,'custom:line','trial-old-'||v_old,
      pg_catalog.jsonb_build_object('sub','trial-old-'||v_old),pg_catalog.now(),pg_catalog.now());
  if exists (select 1 from public.members where auth_user_id=v_old and line_trial_started_at is not null) then
    raise exception 'Pre-existing member received a retroactive trial';
  end if;

  -- The production identity trigger must create the new member and trial together.
  insert into auth.identities(id,user_id,provider,provider_id,identity_data,created_at,updated_at)
    values(extensions.gen_random_uuid(),v_new,'custom:line','trial-new-'||v_new,
      pg_catalog.jsonb_build_object('sub','trial-new-'||v_new),pg_catalog.now(),pg_catalog.now());
  select id,line_trial_started_at into v_member,v_started from public.members where auth_user_id=v_new;
  if v_member is null or v_started is distinct from pg_catalog.now() then
    raise exception 'New verified LINE registration did not start its trial';
  end if;
  perform pg_catalog.set_config('request.jwt.claims',pg_catalog.jsonb_build_object('sub',v_new,'role','authenticated')::text,true);
  perform public.member_bootstrap();
  perform public.member_bootstrap();
  if (select line_trial_started_at from public.members where id=v_member) is distinct from v_started then
    raise exception 'Repeated login restarted the registration trial';
  end if;

  v_profile := public.member_profile()->'exploreEntitlements';
  if (v_profile->>'canUseTianyan')::boolean is not true or (v_profile->>'canUseTiangong')::boolean is not true
    or (v_profile->>'canUseThirteen')::boolean is not false or (v_profile->>'canCustomizeStatus')::boolean is not false then
    raise exception 'Registration trial changed unrelated subscription entitlements';
  end if;
  v_result := public.matrix_tianyan_list('{"lottery":"今彩539","explorePeriods":13,"exploreRange":"完整範圍","selectedStreaks":[]}'::jsonb);
  if v_result->>'kind' <> 'tianyan' then raise exception 'Tianyan trial did not read the stored result'; end if;
  v_result := public.matrix_tiangong_list('{"lottery":"今彩539","periodRange":50,"mode":"two-stage","hitCondition":"準2進3","exploreDirections":["固定"],"firstStageDirections":["固定"],"firstRoadTypes":["加減"],"secondStageDirections":["固定"],"secondRoadTypes":["合值"]}'::jsonb);
  if v_result->>'kind' <> 'tiangong' then raise exception 'Tiangong trial did not read the stored result'; end if;

  -- Boundary is exclusive: Tianyan remains open at 24h, Tiangong closes.
  update public.members set line_trial_started_at=pg_catalog.now()-interval '24 hours' where id=v_member;
  v_profile := public.member_profile()->'exploreEntitlements';
  if (v_profile->>'canUseTianyan')::boolean is not true or (v_profile->>'canUseTiangong')::boolean is not false then
    raise exception '24-hour boundary is incorrect';
  end if;
  v_denied := false;
  begin
    perform public.matrix_tiangong_list('{"lottery":"今彩539","periodRange":50,"mode":"two-stage","hitCondition":"準2進3"}'::jsonb);
  exception when insufficient_privilege then v_denied := true;
  end;
  if not v_denied then raise exception 'Expired Tiangong trial was allowed'; end if;

  update public.members set line_trial_started_at=pg_catalog.now()-interval '48 hours' where id=v_member;
  v_profile := public.member_profile()->'exploreEntitlements';
  if (v_profile->>'canUseTianyan')::boolean is not false or (v_profile->>'canUseTiangong')::boolean is not false then
    raise exception '48-hour boundary is incorrect';
  end if;
  v_denied := false;
  begin
    perform public.matrix_tianyan_list('{"lottery":"今彩539","selectedStreaks":[]}'::jsonb);
  exception when insufficient_privilege then v_denied := true;
  end;
  if not v_denied then raise exception 'Expired Tianyan trial was allowed'; end if;

  update public.members set line_trial_started_at=pg_catalog.now()+interval '1 hour' where id=v_member;
  v_profile := public.member_profile()->'exploreEntitlements';
  if (v_profile->>'canUseTianyan')::boolean is not false then raise exception 'Future trial timestamp was accepted'; end if;

  update public.members set line_trial_started_at=pg_catalog.now(),status='停用' where id=v_member;
  v_denied := false;
  begin perform public.member_profile();
  exception when insufficient_privilege then v_denied := true;
  end;
  if not v_denied then raise exception 'Disabled registration trial member was allowed'; end if;

  if has_column_privilege('authenticated','public.members','line_trial_started_at','UPDATE') then
    raise exception 'Members can edit their registration trial timestamp';
  end if;
  if has_function_privilege('authenticated','private.initialize_line_registration_trial()','EXECUTE') then
    raise exception 'Registration trigger is publicly executable';
  end if;
end;
$$;
select 'LINE registration trial fixture passed' as result;
rollback;
