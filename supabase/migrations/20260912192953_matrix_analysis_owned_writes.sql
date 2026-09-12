-- Rollout 1/3: add this RPC while legacy workers still have direct write grants.
-- Next deploy the Python API and every analysis worker using owned writes.
-- After old processes have drained, apply matrix_analysis_seal_direct_writes.
-- Keep existing completed data and version names unchanged.
begin;

create or replace function public.matrix_analysis_write_owned(
  p_lottery text,
  p_draw_period text,
  p_analysis_version text,
  p_owner_id text,
  p_started_at timestamptz,
  p_target text,
  p_records jsonb
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_run public.matrix_analysis_runs%rowtype;
begin
  if p_target is null or p_target not in (
    'matrix_analysis_artifacts', 'matrix_analysis_artifact_chunks',
    'matrix_explore_results', 'matrix_tianheng_results'
  ) then
    raise exception using errcode = '22023', message = 'ANALYSIS_WRITE_TARGET_INVALID';
  end if;
  if pg_catalog.jsonb_typeof(p_records) is distinct from 'array' then
    raise exception using errcode = '22023', message = 'ANALYSIS_WRITE_RECORDS_INVALID';
  end if;
  if pg_catalog.jsonb_array_length(p_records) > 100 then
    raise exception using errcode = '22023', message = 'ANALYSIS_WRITE_RECORDS_INVALID';
  end if;
  if exists (
    select 1 from pg_catalog.jsonb_array_elements(p_records) as item
    where pg_catalog.jsonb_typeof(item) is distinct from 'object'
       or item->>'lottery' is distinct from p_lottery
       or item->>'draw_period' is distinct from p_draw_period
       or item->>'analysis_version' is distinct from p_analysis_version
  ) then
    raise exception using errcode = '22023', message = 'ANALYSIS_WRITE_RECORD_SCOPE_INVALID';
  end if;

  -- The lock serializes every child write with source invalidation (parent DELETE),
  -- lease takeover, progress and completion. Checking before a separate upsert
  -- is insufficient: a deleted parent can be recreated at the same version.
  select * into v_run
  from public.matrix_analysis_runs
  where lottery = p_lottery and draw_period = p_draw_period
    and analysis_version = p_analysis_version
  for update;
  if not found
    or nullif(pg_catalog.btrim(p_owner_id), '') is null
    or v_run.lease_owner is distinct from p_owner_id
    or v_run.started_at is distinct from p_started_at
    or v_run.status <> 'running'
    or v_run.lease_expires_at is null
    or v_run.lease_expires_at <= pg_catalog.clock_timestamp()
  then
    return false;
  end if;

  if p_target = 'matrix_analysis_artifacts' then
    insert into public.matrix_analysis_artifacts (
      lottery, draw_period, analysis_version, kind, payload, completed_at, expires_at
    )
    select r.lottery, r.draw_period, r.analysis_version, r.kind, r.payload, r.completed_at, r.expires_at
    from pg_catalog.jsonb_populate_recordset(null::public.matrix_analysis_artifacts, p_records) as r
    on conflict (lottery, draw_period, analysis_version, kind) do update set
      payload = excluded.payload,
      completed_at = excluded.completed_at,
      expires_at = excluded.expires_at;
  elsif p_target = 'matrix_analysis_artifact_chunks' then
    insert into public.matrix_analysis_artifact_chunks (
      lottery, draw_period, analysis_version, kind, chunk_index, cursor_start, cursor_end, payload, expires_at
    )
    select r.lottery, r.draw_period, r.analysis_version, r.kind, r.chunk_index, r.cursor_start, r.cursor_end, r.payload, r.expires_at
    from pg_catalog.jsonb_populate_recordset(null::public.matrix_analysis_artifact_chunks, p_records) as r
    on conflict (lottery, draw_period, analysis_version, kind, chunk_index) do update set
      cursor_start = excluded.cursor_start,
      cursor_end = excluded.cursor_end,
      payload = excluded.payload,
      expires_at = excluded.expires_at;
  elsif p_target = 'matrix_explore_results' then
    insert into public.matrix_explore_results (
      lottery, draw_period, analysis_version, item_id, number, locked_position, prediction_distance, consecutive, highest_streak, prediction_numbers, algorithm_type, number_order, rule_count, explore_range, locked_source_index, locked_source_period, reference_offset, reference_position, item, validation, expires_at
    )
    select r.lottery, r.draw_period, r.analysis_version, r.item_id, r.number, r.locked_position, r.prediction_distance, r.consecutive, r.highest_streak, r.prediction_numbers, r.algorithm_type, r.number_order, r.rule_count, r.explore_range, r.locked_source_index, r.locked_source_period, r.reference_offset, r.reference_position, r.item, r.validation, r.expires_at
    from pg_catalog.jsonb_populate_recordset(null::public.matrix_explore_results, p_records) as r
    on conflict (lottery, draw_period, analysis_version, item_id) do update set
      number = excluded.number,
      locked_position = excluded.locked_position,
      prediction_distance = excluded.prediction_distance,
      consecutive = excluded.consecutive,
      highest_streak = excluded.highest_streak,
      prediction_numbers = excluded.prediction_numbers,
      algorithm_type = excluded.algorithm_type,
      number_order = excluded.number_order,
      rule_count = excluded.rule_count,
      explore_range = excluded.explore_range,
      locked_source_index = excluded.locked_source_index,
      locked_source_period = excluded.locked_source_period,
      reference_offset = excluded.reference_offset,
      reference_position = excluded.reference_position,
      item = excluded.item,
      validation = excluded.validation,
      expires_at = excluded.expires_at;
  elsif p_target = 'matrix_tianheng_results' then
    insert into public.matrix_tianheng_results (
      lottery, draw_period, analysis_version, item_id, first_number, first_locked_position, second_number, second_locked_position, prediction_distance, consecutive, highest_streak, prediction_numbers, algorithm_type, number_order, rule_count, explore_range, locked_source_index, locked_source_period, reference_offset, reference_position, item, validation, expires_at
    )
    select r.lottery, r.draw_period, r.analysis_version, r.item_id, r.first_number, r.first_locked_position, r.second_number, r.second_locked_position, r.prediction_distance, r.consecutive, r.highest_streak, r.prediction_numbers, r.algorithm_type, r.number_order, r.rule_count, r.explore_range, r.locked_source_index, r.locked_source_period, r.reference_offset, r.reference_position, r.item, r.validation, r.expires_at
    from pg_catalog.jsonb_populate_recordset(null::public.matrix_tianheng_results, p_records) as r
    on conflict (lottery, draw_period, analysis_version, item_id) do update set
      first_number = excluded.first_number,
      first_locked_position = excluded.first_locked_position,
      second_number = excluded.second_number,
      second_locked_position = excluded.second_locked_position,
      prediction_distance = excluded.prediction_distance,
      consecutive = excluded.consecutive,
      highest_streak = excluded.highest_streak,
      prediction_numbers = excluded.prediction_numbers,
      algorithm_type = excluded.algorithm_type,
      number_order = excluded.number_order,
      rule_count = excluded.rule_count,
      explore_range = excluded.explore_range,
      locked_source_index = excluded.locked_source_index,
      locked_source_period = excluded.locked_source_period,
      reference_offset = excluded.reference_offset,
      reference_position = excluded.reference_position,
      item = excluded.item,
      validation = excluded.validation,
      expires_at = excluded.expires_at;
  end if;
  return true;
end;
$function$;

-- This narrowly scoped SECURITY DEFINER is needed after direct writes are revoked.
-- Only trusted backend callers can invoke it; no public/customer RPC is added.
revoke all on function public.matrix_analysis_write_owned(text,text,text,text,timestamptz,text,jsonb)
  from public, anon, authenticated;
grant execute on function public.matrix_analysis_write_owned(text,text,text,text,timestamptz,text,jsonb)
  to service_role;

-- Completed artifacts are immutable after the seal migration. The Python
-- restoration seam reads their generation BEFORE materializing saved chunks;
-- this narrow RPC cannot write artifacts or change run visibility/leases.
create or replace function public.matrix_analysis_restore_results(
  p_lottery text,
  p_draw_period text,
  p_analysis_version text,
  p_started_at timestamptz,
  p_kind text,
  p_records jsonb
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_run public.matrix_analysis_runs%rowtype;
begin
  if p_kind is null or p_kind not in ('explore', 'tianheng') then
    raise exception using errcode = '22023', message = 'UNKNOWN_RESULT_KIND';
  end if;
  if pg_catalog.jsonb_typeof(p_records) is distinct from 'array' then
    raise exception using errcode = '22023', message = 'ANALYSIS_WRITE_RECORDS_INVALID';
  end if;
  if pg_catalog.jsonb_array_length(p_records) > 100 then
    raise exception using errcode = '22023', message = 'ANALYSIS_WRITE_RECORDS_INVALID';
  end if;
  if exists (
    select 1 from pg_catalog.jsonb_array_elements(p_records) as item
    where pg_catalog.jsonb_typeof(item) is distinct from 'object'
       or item->>'lottery' is distinct from p_lottery
       or item->>'draw_period' is distinct from p_draw_period
       or item->>'analysis_version' is distinct from p_analysis_version
  ) then
    raise exception using errcode = '22023', message = 'ANALYSIS_WRITE_RECORD_SCOPE_INVALID';
  end if;

  select * into v_run from public.matrix_analysis_runs
  where lottery = p_lottery and draw_period = p_draw_period
    and analysis_version = p_analysis_version
  for update;
  if not found or v_run.status <> 'complete'
    or v_run.started_at is distinct from p_started_at
    or not exists (
      select 1 from public.matrix_analysis_artifacts
      where lottery = p_lottery and draw_period = p_draw_period
        and analysis_version = p_analysis_version and kind = p_kind
    )
  then
    return false;
  end if;

  if p_kind = 'explore' then
    insert into public.matrix_explore_results (
      lottery, draw_period, analysis_version, item_id, number, locked_position, prediction_distance, consecutive, highest_streak, prediction_numbers, algorithm_type, number_order, rule_count, explore_range, locked_source_index, locked_source_period, reference_offset, reference_position, item, validation, expires_at
    )
    select r.lottery, r.draw_period, r.analysis_version, r.item_id, r.number, r.locked_position, r.prediction_distance, r.consecutive, r.highest_streak, r.prediction_numbers, r.algorithm_type, r.number_order, r.rule_count, r.explore_range, r.locked_source_index, r.locked_source_period, r.reference_offset, r.reference_position, r.item, r.validation, r.expires_at
    from pg_catalog.jsonb_populate_recordset(null::public.matrix_explore_results, p_records) as r
    on conflict (lottery, draw_period, analysis_version, item_id) do update set
      number = excluded.number,
      locked_position = excluded.locked_position,
      prediction_distance = excluded.prediction_distance,
      consecutive = excluded.consecutive,
      highest_streak = excluded.highest_streak,
      prediction_numbers = excluded.prediction_numbers,
      algorithm_type = excluded.algorithm_type,
      number_order = excluded.number_order,
      rule_count = excluded.rule_count,
      explore_range = excluded.explore_range,
      locked_source_index = excluded.locked_source_index,
      locked_source_period = excluded.locked_source_period,
      reference_offset = excluded.reference_offset,
      reference_position = excluded.reference_position,
      item = excluded.item,
      validation = excluded.validation,
      expires_at = excluded.expires_at;
  elsif p_kind = 'tianheng' then
    insert into public.matrix_tianheng_results (
      lottery, draw_period, analysis_version, item_id, first_number, first_locked_position, second_number, second_locked_position, prediction_distance, consecutive, highest_streak, prediction_numbers, algorithm_type, number_order, rule_count, explore_range, locked_source_index, locked_source_period, reference_offset, reference_position, item, validation, expires_at
    )
    select r.lottery, r.draw_period, r.analysis_version, r.item_id, r.first_number, r.first_locked_position, r.second_number, r.second_locked_position, r.prediction_distance, r.consecutive, r.highest_streak, r.prediction_numbers, r.algorithm_type, r.number_order, r.rule_count, r.explore_range, r.locked_source_index, r.locked_source_period, r.reference_offset, r.reference_position, r.item, r.validation, r.expires_at
    from pg_catalog.jsonb_populate_recordset(null::public.matrix_tianheng_results, p_records) as r
    on conflict (lottery, draw_period, analysis_version, item_id) do update set
      first_number = excluded.first_number,
      first_locked_position = excluded.first_locked_position,
      second_number = excluded.second_number,
      second_locked_position = excluded.second_locked_position,
      prediction_distance = excluded.prediction_distance,
      consecutive = excluded.consecutive,
      highest_streak = excluded.highest_streak,
      prediction_numbers = excluded.prediction_numbers,
      algorithm_type = excluded.algorithm_type,
      number_order = excluded.number_order,
      rule_count = excluded.rule_count,
      explore_range = excluded.explore_range,
      locked_source_index = excluded.locked_source_index,
      locked_source_period = excluded.locked_source_period,
      reference_offset = excluded.reference_offset,
      reference_position = excluded.reference_position,
      item = excluded.item,
      validation = excluded.validation,
      expires_at = excluded.expires_at;
  end if;
  return true;
end;
$function$;

revoke all on function public.matrix_analysis_restore_results(text,text,text,timestamptz,text,jsonb)
  from public, anon, authenticated;
grant execute on function public.matrix_analysis_restore_results(text,text,text,timestamptz,text,jsonb)
  to service_role;

commit;
