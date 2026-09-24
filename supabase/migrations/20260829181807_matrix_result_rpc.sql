begin;

create or replace function private.matrix_result_entitlements()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_member public.members%rowtype;
  v_plan text := 'free';
  v_paid boolean := false;
  v_referrals integer := 0;
  v_dow integer := extract(isodow from pg_catalog.timezone('Asia/Taipei', pg_catalog.now()));
begin
  if v_uid is not null then
    select * into v_member from public.members where auth_user_id = v_uid limit 1;
    if not found or pg_catalog.coalesce(v_member.status, '') in ('停用', 'disabled', 'inactive') then
      raise exception using errcode = '42501', message = 'FORBIDDEN';
    end if;
    if v_member.is_lifetime then
      v_plan := 'lifetime';
      v_paid := true;
    else
      select case plan.name
        when '試用方案' then 'trial'
        when '月費方案' then 'monthly'
        when '季費方案' then 'quarterly'
        when '年費方案' then 'yearly'
        else 'free'
      end into v_plan
      from public.plans as plan where plan.id = v_member.current_plan_id;
      v_plan := pg_catalog.coalesce(v_plan, 'free');
      v_paid := v_plan <> 'free'
        and pg_catalog.coalesce(v_member.plan_expires_at > pg_catalog.now(), false);
    end if;
    if pg_catalog.coalesce(v_member.referral_code, '') <> '' then
      select pg_catalog.count(distinct invited.id)::integer into v_referrals
      from public.members as invited
      where invited.invitation_code = v_member.referral_code
        and exists (
          select 1 from public.payments as payment
          where payment.member_id = invited.id and payment.status = 'confirmed'
        );
    end if;
  end if;

  return pg_catalog.jsonb_build_object(
    'canUseSeven', v_paid or v_referrals >= 15 or v_dow in (2, 5) or (v_referrals >= 10 and v_dow in (1, 4)),
    'canUseThirteen', v_paid,
    'canUseFullRange', v_paid or v_referrals >= 50 or (v_referrals >= 30 and v_dow in (2, 5)),
    'canUseTianyan', v_paid and v_plan in ('quarterly', 'yearly', 'lifetime'),
    'canUseTiangong', v_paid and v_plan in ('yearly', 'lifetime'),
    'canViewFullStatus', v_paid,
    'canCustomizeStatus', v_paid and v_plan <> 'trial',
    'canUseCompositeCustomRoad', v_paid and v_plan in ('quarterly', 'yearly', 'lifetime')
  );
end;
$$;

create or replace function private.matrix_artifact_payload(
  p_kind text,
  p_lottery text,
  p_draw_period text,
  p_analysis_version text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_payload jsonb;
  v_items jsonb;
  v_validations jsonb;
begin
  select artifact.payload into v_payload
  from public.matrix_analysis_artifacts as artifact
  where artifact.kind = p_kind
    and artifact.lottery = p_lottery
    and artifact.draw_period = p_draw_period
    and artifact.analysis_version = p_analysis_version
  limit 1;

  if v_payload is null then return null; end if;
  if pg_catalog.coalesce(v_payload->>'storage', '') <> 'chunks' then return v_payload; end if;

  select pg_catalog.coalesce(pg_catalog.jsonb_agg(item order by chunk.chunk_index), '[]'::jsonb)
    into v_items
  from public.matrix_analysis_artifact_chunks as chunk
  cross join lateral pg_catalog.jsonb_array_elements(
    pg_catalog.coalesce(chunk.payload->'items', '[]'::jsonb)
  ) as item
  where chunk.kind = p_kind
    and chunk.lottery = p_lottery
    and chunk.draw_period = p_draw_period
    and chunk.analysis_version = p_analysis_version;

  select pg_catalog.coalesce(pg_catalog.jsonb_object_agg(pair.key, pair.value), '{}'::jsonb)
    into v_validations
  from public.matrix_analysis_artifact_chunks as chunk
  cross join lateral pg_catalog.jsonb_each(
    pg_catalog.coalesce(chunk.payload->'validationById', '{}'::jsonb)
  ) as pair
  where chunk.kind = p_kind
    and chunk.lottery = p_lottery
    and chunk.draw_period = p_draw_period
    and chunk.analysis_version = p_analysis_version;

  return pg_catalog.jsonb_build_object(
    'lottery', p_lottery,
    'drawPeriod', p_draw_period,
    'items', v_items,
    'validationById', v_validations
  );
end;
$$;

revoke all on function private.matrix_result_entitlements() from public, anon, authenticated;
revoke all on function private.matrix_artifact_payload(text, text, text, text) from public, anon, authenticated;

create or replace function public.matrix_tianyan_list(p_request jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_lottery text := nullif(pg_catalog.btrim(p_request->>'lottery'), '');
  v_period text := nullif(pg_catalog.btrim(p_request->>'drawPeriod'), '');
  v_streaks jsonb := pg_catalog.coalesce(p_request->'selectedStreaks', '[]'::jsonb);
  v_version text;
  v_draw text;
  v_payload jsonb;
  v_items jsonb;
  v_entitlements jsonb := private.matrix_result_entitlements();
begin
  if v_lottery not in ('今彩539', '天天樂', '六合彩', '大樂透')
    or pg_catalog.jsonb_typeof(v_streaks) <> 'array' then
    raise exception using errcode = '22023', message = 'INVALID_REQUEST';
  end if;
  if (v_entitlements->>'canUseTianyan')::boolean is not true then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;
  select run.analysis_version, run.draw_period into v_version, v_draw
  from public.matrix_analysis_runs as run
  where run.lottery = v_lottery and run.status = 'complete'
    and (v_period is null or run.draw_period = v_period)
  order by run.completed_at desc nulls last limit 1;
  if v_version is null then
    raise exception using errcode = 'P0001', message = 'ANALYSIS_NOT_READY';
  end if;
  v_payload := private.matrix_artifact_payload('tianyan', v_lottery, v_draw, v_version);
  if v_payload is null then raise exception using errcode = 'P0001', message = 'ANALYSIS_NOT_READY'; end if;
  select pg_catalog.coalesce(pg_catalog.jsonb_agg(item order by (item->>'highestStreak')::integer desc, item->>'id'), '[]'::jsonb)
    into v_items
  from pg_catalog.jsonb_array_elements(pg_catalog.coalesce(v_payload->'items', '[]'::jsonb)) as item
  where v_streaks ? (item->>'consecutive');
  return pg_catalog.jsonb_build_object(
    'kind', 'tianyan', 'lottery', v_lottery, 'drawPeriod', v_draw,
    'analysisVersion', v_version, 'status', 'complete',
    'items', v_items, 'total', pg_catalog.jsonb_array_length(v_items)
  );
end;
$$;

create or replace function public.matrix_tianyan_validation(p_request jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_lottery text := nullif(pg_catalog.btrim(p_request->>'lottery'), '');
  v_draw text := nullif(pg_catalog.btrim(p_request->>'drawPeriod'), '');
  v_version text := nullif(pg_catalog.btrim(p_request->>'analysisVersion'), '');
  v_item_id text := nullif(pg_catalog.btrim(p_request->>'itemId'), '');
  v_payload jsonb;
  v_validation jsonb;
begin
  if (private.matrix_result_entitlements()->>'canUseTianyan')::boolean is not true then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;
  if v_lottery is null or v_draw is null or v_version is null or v_item_id is null then
    raise exception using errcode = '22023', message = 'INVALID_REQUEST';
  end if;
  if not exists (
    select 1 from public.matrix_analysis_runs
    where lottery = v_lottery and draw_period = v_draw
      and analysis_version = v_version and status = 'complete'
  ) then
    raise exception using errcode = 'P0001', message = 'ANALYSIS_VERSION_MISMATCH';
  end if;
  v_payload := private.matrix_artifact_payload('tianyan', v_lottery, v_draw, v_version);
  v_validation := v_payload->'validationById'->v_item_id;
  if v_validation is null then raise exception using errcode = '22023', message = 'INVALID_REQUEST'; end if;
  return pg_catalog.jsonb_build_object(
    'kind', 'tianyan', 'lottery', v_lottery, 'drawPeriod', v_draw,
    'analysisVersion', v_version, 'status', 'complete',
    'itemId', v_item_id, 'validation', v_validation
  );
end;
$$;

create or replace function public.matrix_tiangong_list(p_request jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_lottery text := nullif(pg_catalog.btrim(p_request->>'lottery'), '');
  v_period_range integer := (p_request->>'periodRange')::integer;
  v_mode text := p_request->>'mode';
  v_hit text := p_request->>'hitCondition';
  v_explore jsonb := pg_catalog.coalesce(p_request->'exploreDirections', '[]'::jsonb);
  v_first_directions jsonb := pg_catalog.coalesce(p_request->'firstStageDirections', '[]'::jsonb);
  v_first_roads jsonb := pg_catalog.coalesce(p_request->'firstRoadTypes', '[]'::jsonb);
  v_second_directions jsonb := pg_catalog.coalesce(p_request->'secondStageDirections', '[]'::jsonb);
  v_second_roads jsonb := pg_catalog.coalesce(p_request->'secondRoadTypes', '[]'::jsonb);
  v_version text;
  v_draw text;
  v_payload jsonb;
  v_items jsonb;
begin
  if (private.matrix_result_entitlements()->>'canUseTiangong')::boolean is not true then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;
  if v_lottery not in ('今彩539', '天天樂', '六合彩', '大樂透')
    or v_period_range not in (50, 80)
    or v_mode not in ('one-stage', 'two-stage')
    or v_hit not in ('準2進3', '準3進4')
    or pg_catalog.jsonb_typeof(v_explore) <> 'array'
    or pg_catalog.jsonb_typeof(v_first_directions) <> 'array'
    or pg_catalog.jsonb_typeof(v_first_roads) <> 'array' then
    raise exception using errcode = '22023', message = 'INVALID_REQUEST';
  end if;
  select run.analysis_version, run.draw_period into v_version, v_draw
  from public.matrix_analysis_runs as run
  where run.lottery = v_lottery and run.status = 'complete'
  order by run.completed_at desc nulls last limit 1;
  if v_version is null then raise exception using errcode = 'P0001', message = 'ANALYSIS_NOT_READY'; end if;
  v_payload := private.matrix_artifact_payload('tiangong', v_lottery, v_draw, v_version);
  if v_payload is null then raise exception using errcode = 'P0001', message = 'ANALYSIS_NOT_READY'; end if;
  select pg_catalog.coalesce(pg_catalog.jsonb_agg(item order by (item->>'interval')::integer, item->>'id'), '[]'::jsonb)
    into v_items
  from pg_catalog.jsonb_array_elements(pg_catalog.coalesce(v_payload->'items', '[]'::jsonb)) as item
  where (item->>'eligiblePeriodRange')::integer <= v_period_range
    and item->>'mode' = v_mode
    and item->>'hitCondition' = v_hit
    and v_explore ? (item->>'exploreDirection')
    and v_first_directions ? (item->>'firstStageDirection')
    and v_first_roads ? (item->>'firstRoadType')
    and (v_mode = 'one-stage' or (
      v_second_directions ? (item->>'secondStageDirection')
      and v_second_roads ? (item->>'secondRoadType')
    ));
  return pg_catalog.jsonb_build_object(
    'kind', 'tiangong', 'lottery', v_lottery, 'drawPeriod', v_draw,
    'analysisVersion', v_version, 'status', 'complete',
    'items', v_items, 'total', pg_catalog.jsonb_array_length(v_items)
  );
exception when invalid_text_representation then
  raise exception using errcode = '22023', message = 'INVALID_REQUEST';
end;
$$;

create or replace function public.matrix_tiangong_validation(p_request jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_lottery text := nullif(pg_catalog.btrim(p_request->>'lottery'), '');
  v_draw text := nullif(pg_catalog.btrim(p_request->>'drawPeriod'), '');
  v_version text := nullif(pg_catalog.btrim(p_request->>'analysisVersion'), '');
  v_item_id text := nullif(pg_catalog.btrim(p_request->>'itemId'), '');
  v_payload jsonb;
  v_validation jsonb;
begin
  if (private.matrix_result_entitlements()->>'canUseTiangong')::boolean is not true then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;
  if v_lottery is null or v_draw is null or v_version is null or v_item_id is null then
    raise exception using errcode = '22023', message = 'INVALID_REQUEST';
  end if;
  if not exists (
    select 1 from public.matrix_analysis_runs
    where lottery = v_lottery and draw_period = v_draw
      and analysis_version = v_version and status = 'complete'
  ) then
    raise exception using errcode = 'P0001', message = 'ANALYSIS_VERSION_MISMATCH';
  end if;
  v_payload := private.matrix_artifact_payload('tiangong', v_lottery, v_draw, v_version);
  v_validation := v_payload->'validationById'->v_item_id;
  if v_validation is null then raise exception using errcode = '22023', message = 'INVALID_REQUEST'; end if;
  return pg_catalog.jsonb_build_object(
    'kind', 'tiangong', 'lottery', v_lottery, 'drawPeriod', v_draw,
    'analysisVersion', v_version, 'status', 'complete',
    'itemId', v_item_id, 'validation', v_validation
  );
end;
$$;

create or replace function public.matrix_status_sources_get(p_request jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_lottery text := nullif(pg_catalog.btrim(p_request->>'lottery'), '');
  v_period text := nullif(pg_catalog.btrim(p_request->>'drawPeriod'), '');
  v_version text;
  v_draw text;
  v_payload jsonb;
  v_sources jsonb;
begin
  if v_lottery not in ('今彩539', '天天樂', '六合彩', '大樂透') then
    raise exception using errcode = '22023', message = 'INVALID_REQUEST';
  end if;
  select run.analysis_version, run.draw_period into v_version, v_draw
  from public.matrix_analysis_runs as run
  where run.lottery = v_lottery and run.status = 'complete'
    and (v_period is null or run.draw_period = v_period)
  order by run.completed_at desc nulls last limit 1;
  if v_version is null then
    raise exception using errcode = 'P0001', message = 'ANALYSIS_NOT_READY';
  end if;
  v_payload := private.matrix_artifact_payload('status', v_lottery, v_draw, v_version);
  v_sources := v_payload->'statusSources';
  if v_sources is null or v_sources->'explore' is null or v_sources->'tianyan' is null then
    raise exception using errcode = 'P0001', message = 'ANALYSIS_NOT_READY';
  end if;
  return pg_catalog.jsonb_build_object(
    'analysisVersion', v_version,
    'drawPeriod', v_draw,
    'explore', v_sources->'explore',
    'tianyan', v_sources->'tianyan'
  );
end;
$$;

create or replace function public.matrix_status_get(p_request jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_lottery text := nullif(pg_catalog.btrim(p_request->>'lottery'), '');
  v_period text := nullif(pg_catalog.btrim(p_request->>'drawPeriod'), '');
  v_version text;
  v_draw text;
  v_payload jsonb;
  v_entitlements jsonb := private.matrix_result_entitlements();
begin
  if v_lottery not in ('今彩539', '天天樂', '六合彩', '大樂透') then
    raise exception using errcode = '22023', message = 'INVALID_REQUEST';
  end if;
  select run.analysis_version, run.draw_period into v_version, v_draw
  from public.matrix_analysis_runs as run
  where run.lottery = v_lottery and run.status = 'complete'
    and (v_period is null or run.draw_period = v_period)
  order by run.completed_at desc nulls last limit 1;
  if v_version is null then raise exception using errcode = 'P0001', message = 'ANALYSIS_NOT_READY'; end if;
  v_payload := private.matrix_artifact_payload('status', v_lottery, v_draw, v_version);
  if v_payload is null then raise exception using errcode = 'P0001', message = 'ANALYSIS_NOT_READY'; end if;
  return pg_catalog.jsonb_build_object(
    'kind', 'status', 'lottery', v_lottery, 'drawPeriod', v_draw,
    'analysisVersion', v_version || ':status',
    'customTriggers', '[]'::jsonb,
    'detailLocked', not (v_entitlements->>'canViewFullStatus')::boolean
  ) || (v_payload - 'lottery' - 'drawPeriod' - 'artifactKinds' - 'artifactCounts' - 'statusSources');
end;
$$;

create or replace function public.matrix_custom_status_list()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_member_id uuid;
  v_entitlements jsonb;
  v_items jsonb;
begin
  if v_uid is null then raise exception using errcode = '42501', message = 'AUTH_REQUIRED'; end if;
  select id into v_member_id from public.members where auth_user_id = v_uid limit 1;
  if v_member_id is null then raise exception using errcode = '42501', message = 'FORBIDDEN'; end if;
  v_entitlements := private.matrix_result_entitlements();
  select pg_catalog.coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'config', config,
    'evaluation', pg_catalog.jsonb_build_object(
      'mode', case when (v_entitlements->>'canCustomizeStatus')::boolean then 'custom' else 'chapter15' end,
      'preserved', true
    )
  ) order by lottery, status), '[]'::jsonb) into v_items
  from public.matrix_custom_status_configs where member_id = v_member_id;
  return pg_catalog.jsonb_build_object('items', v_items, 'entitlements', v_entitlements);
end;
$$;

create or replace function public.matrix_custom_status_save(p_config jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_member_id uuid;
  v_lottery text := p_config->>'lottery';
  v_status text := p_config->>'status';
  v_entitlements jsonb;
begin
  if v_uid is null then raise exception using errcode = '42501', message = 'AUTH_REQUIRED'; end if;
  select id into v_member_id from public.members where auth_user_id = v_uid limit 1;
  if v_member_id is null then raise exception using errcode = '42501', message = 'FORBIDDEN'; end if;
  v_entitlements := private.matrix_result_entitlements();
  if (v_entitlements->>'canCustomizeStatus')::boolean is not true then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;
  if v_lottery not in ('今彩539', '天天樂', '六合彩', '大樂透')
    or v_status not in ('ACTIVE', 'FOCUS', 'RESONANCE', 'CRITICAL')
    or p_config->>'explorePeriods' <> '13'
    or p_config->>'exploreRange' <> '完整範圍'
    or pg_catalog.jsonb_typeof(p_config->'oneCodeGroups') <> 'array'
    or pg_catalog.jsonb_typeof(p_config->'twoCodeGroups') <> 'array' then
    raise exception using errcode = '22023', message = 'INVALID_REQUEST';
  end if;
  if (v_entitlements->>'canUseCompositeCustomRoad')::boolean is not true and (
    pg_catalog.jsonb_path_exists(p_config, '$.oneCodeGroups[*].rows[*] ? (@.roadType == "複合")')
    or pg_catalog.jsonb_path_exists(p_config, '$.twoCodeGroups[*].rows[*] ? (@.roadType == "複合")')
  ) then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;
  insert into public.matrix_custom_status_configs (member_id, lottery, status, config, updated_at)
  values (v_member_id, v_lottery, v_status, p_config, pg_catalog.now())
  on conflict (member_id, lottery, status) do update
    set config = excluded.config, updated_at = excluded.updated_at;
  return pg_catalog.jsonb_build_object('item', p_config);
end;
$$;

create or replace function public.matrix_custom_status_reset(p_lottery text, p_status text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_member_id uuid;
begin
  if v_uid is null then raise exception using errcode = '42501', message = 'AUTH_REQUIRED'; end if;
  perform private.matrix_result_entitlements();
  select id into v_member_id from public.members where auth_user_id = v_uid limit 1;
  if v_member_id is null then raise exception using errcode = '42501', message = 'FORBIDDEN'; end if;
  if p_lottery not in ('今彩539', '天天樂', '六合彩', '大樂透')
    or p_status not in ('ACTIVE', 'FOCUS', 'RESONANCE', 'CRITICAL') then
    raise exception using errcode = '22023', message = 'INVALID_REQUEST';
  end if;
  delete from public.matrix_custom_status_configs
  where member_id = v_member_id and lottery = p_lottery and status = p_status;
  return '{}'::jsonb;
end;
$$;

revoke all on function public.matrix_tianyan_list(jsonb) from public, anon, authenticated;
revoke all on function public.matrix_tianyan_validation(jsonb) from public, anon, authenticated;
revoke all on function public.matrix_tiangong_list(jsonb) from public, anon, authenticated;
revoke all on function public.matrix_tiangong_validation(jsonb) from public, anon, authenticated;
revoke all on function public.matrix_status_sources_get(jsonb) from public, anon, authenticated;
revoke all on function public.matrix_status_get(jsonb) from public, anon, authenticated;
revoke all on function public.matrix_custom_status_list() from public, anon, authenticated;
revoke all on function public.matrix_custom_status_save(jsonb) from public, anon, authenticated;
revoke all on function public.matrix_custom_status_reset(text, text) from public, anon, authenticated;

grant execute on function public.matrix_tianyan_list(jsonb) to authenticated;
grant execute on function public.matrix_tianyan_validation(jsonb) to authenticated;
grant execute on function public.matrix_tiangong_list(jsonb) to authenticated;
grant execute on function public.matrix_tiangong_validation(jsonb) to authenticated;
grant execute on function public.matrix_status_sources_get(jsonb) to service_role;
grant execute on function public.matrix_custom_status_list() to authenticated;
grant execute on function public.matrix_custom_status_save(jsonb) to authenticated;
grant execute on function public.matrix_custom_status_reset(text, text) to authenticated;

commit;
