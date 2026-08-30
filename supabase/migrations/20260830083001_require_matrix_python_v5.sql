begin;

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
  if p_kind in ('explore', 'tianyan', 'status')
    and p_analysis_version <> 'matrix-python-v5' then
    return null;
  end if;

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

revoke all on function private.matrix_artifact_payload(text, text, text, text)
  from public, anon, authenticated;

create or replace function public.matrix_explore_list(p_request jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_lottery text := nullif(trim(p_request->>'lottery'),'');
  v_period text := nullif(trim(p_request->>'drawPeriod'),'');
  v_order text := p_request->>'numberOrder';
  v_periods integer := (p_request->>'explorePeriods')::integer;
  v_offset integer := (p_request->>'exploreDateOffset')::integer;
  v_range text := p_request->>'exploreRange';
  v_rule integer := (p_request->>'ruleCount')::integer;
  v_roads jsonb := coalesce(p_request->'roadTypes','[]'::jsonb);
  v_streaks jsonb := coalesce(p_request->'selectedStreaks','[]'::jsonb);
  v_same boolean := coalesce((p_request->>'sameCode')::boolean,false);
  v_ent jsonb;
  v_version text;
  v_draw text;
  v_result jsonb;
begin
  if v_lottery not in ('今彩539','天天樂','六合彩','大樂透')
    or v_order not in ('依號碼由小到大排序','依實際開獎順序排序')
    or v_periods not in (2,7,13) or v_offset not in (0,1,2)
    or v_range not in ('標準範圍','完整範圍') or v_rule not in (1,2)
    or jsonb_typeof(v_roads)<>'array' or jsonb_array_length(v_roads)=0
    or jsonb_typeof(v_streaks)<>'array' then
    raise exception using errcode='P0001', message='INVALID_REQUEST';
  end if;
  v_ent := public.matrix_explore_entitlements();
  if (v_periods=7 and not (v_ent->>'canUseSeven')::boolean)
    or (v_periods=13 and not (v_ent->>'canUseThirteen')::boolean)
    or (v_range='完整範圍' and not (v_ent->>'canUseFullRange')::boolean) then
    raise exception using errcode='P0001', message='FORBIDDEN';
  end if;

  select r.analysis_version,r.draw_period into v_version,v_draw
  from public.matrix_analysis_runs r
  where r.lottery=v_lottery and r.status='complete'
    and r.analysis_version = 'matrix-python-v5'
    and (v_period is null or r.draw_period=v_period)
  order by r.completed_at desc nulls last limit 1;
  if v_version is null then raise exception using errcode='P0001', message='ANALYSIS_NOT_READY'; end if;

  with raw_items as (
    select item
    from public.matrix_analysis_artifact_chunks c
    cross join lateral jsonb_array_elements(coalesce(c.payload->'items','[]'::jsonb)) item
    where c.lottery=v_lottery and c.draw_period=v_draw and c.analysis_version=v_version and c.kind='explore'
    union all
    select item
    from public.matrix_analysis_artifacts a
    cross join lateral jsonb_array_elements(coalesce(a.payload->'items','[]'::jsonb)) item
    where a.lottery=v_lottery and a.draw_period=v_draw and a.analysis_version=v_version
      and a.kind='explore' and coalesce(a.payload->>'storage','')<>'chunks'
  ), base as (
    select item from raw_items
    where item->>'numberOrder'=v_order
      and (item->>'explorePeriods')::integer=v_periods
      and (item->>'exploreDateOffset')::integer=v_offset
      and (item->>'ruleCount')::integer=v_rule
      and v_roads ? (item->>'algorithmType')
      and v_streaks ? (item->>'consecutive')
      and (v_range='完整範圍' or coalesce((item->>'referenceOffset')::integer,0)>=-7)
  ), number_counts as (
    select n.value #>> '{}' number,count(*)::integer count
    from base b cross join lateral jsonb_array_elements(b.item->'predictionNumbers') n(value)
    group by n.value
  ), allowed as (
    select b.item from base b
    where not v_same or exists (
      select 1 from jsonb_array_elements(b.item->'predictionNumbers') n(value)
      join number_counts c on c.number=n.value #>> '{}' where c.count>=2
    )
  ), ordered as (
    select item from allowed
    order by (item->>'highestStreak')::integer desc,
      (item->>'predictionDistance')::integer,
      (item->>'lockedPosition')::integer
  ), final_counts as (
    select n.value #>> '{}' number,count(*)::integer count
    from allowed a cross join lateral jsonb_array_elements(a.item->'predictionNumbers') n(value)
    group by n.value
  )
  select jsonb_build_object(
    'kind','explore','lottery',v_lottery,'drawPeriod',v_draw,
    'analysisVersion',v_version,'status','complete',
    'items',coalesce((select jsonb_agg(item) from ordered),'[]'::jsonb),
    'duplicateStats',coalesce((select jsonb_agg(jsonb_build_object('number',number,'count',count)
      order by count desc,number::integer) from final_counts),'[]'::jsonb),
    'total',(select count(*) from allowed)
  ) into v_result;
  return v_result;
exception when invalid_text_representation then
  raise exception using errcode='P0001', message='INVALID_REQUEST';
end $function$;

create or replace function public.matrix_explore_validation(p_request jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_lottery text := nullif(trim(p_request->>'lottery'),'');
  v_draw text := nullif(trim(p_request->>'drawPeriod'),'');
  v_version text := nullif(trim(p_request->>'analysisVersion'),'');
  v_item_id text := nullif(p_request->>'itemId','');
  v_item jsonb; v_validation jsonb; v_ent jsonb;
begin
  if v_lottery is null or v_draw is null or v_version is null or v_item_id is null then
    raise exception using errcode='P0001', message='INVALID_REQUEST';
  end if;
  if v_version <> 'matrix-python-v5' then
    raise exception using errcode='P0001', message='ANALYSIS_VERSION_MISMATCH';
  end if;
  if not exists(select 1 from public.matrix_analysis_runs where lottery=v_lottery and draw_period=v_draw and analysis_version=v_version and status='complete') then
    raise exception using errcode='P0001', message='ANALYSIS_VERSION_MISMATCH';
  end if;
  select x.item into v_item from (
    select item from public.matrix_analysis_artifact_chunks c
      cross join lateral jsonb_array_elements(coalesce(c.payload->'items','[]'::jsonb)) item
      where c.lottery=v_lottery and c.draw_period=v_draw and c.analysis_version=v_version and c.kind='explore'
    union all
    select item from public.matrix_analysis_artifacts a
      cross join lateral jsonb_array_elements(coalesce(a.payload->'items','[]'::jsonb)) item
      where a.lottery=v_lottery and a.draw_period=v_draw and a.analysis_version=v_version and a.kind='explore'
        and coalesce(a.payload->>'storage','')<>'chunks'
  ) x where x.item->>'id'=v_item_id limit 1;
  if v_item is null then raise exception using errcode='P0001', message='INVALID_REQUEST'; end if;
  v_ent := public.matrix_explore_entitlements();
  if ((v_item->>'explorePeriods')::integer=7 and not (v_ent->>'canUseSeven')::boolean)
    or ((v_item->>'explorePeriods')::integer=13 and not (v_ent->>'canUseThirteen')::boolean)
    or (coalesce((v_item->>'referenceOffset')::integer,0)<-7 and not (v_ent->>'canUseFullRange')::boolean) then
    raise exception using errcode='P0001', message='FORBIDDEN';
  end if;
  select validation into v_validation from (
    select c.payload->'validationById'->v_item_id validation
    from public.matrix_analysis_artifact_chunks c
    where c.lottery=v_lottery and c.draw_period=v_draw and c.analysis_version=v_version and c.kind='explore'
      and c.payload->'validationById' ? v_item_id
    union all
    select a.payload->'validationById'->v_item_id
    from public.matrix_analysis_artifacts a
    where a.lottery=v_lottery and a.draw_period=v_draw and a.analysis_version=v_version and a.kind='explore'
      and a.payload->'validationById' ? v_item_id
  ) q limit 1;
  if v_validation is null then raise exception using errcode='P0001', message='INVALID_REQUEST'; end if;
  return jsonb_build_object('kind','explore','lottery',v_lottery,'drawPeriod',v_draw,
    'analysisVersion',v_version,'status','complete','itemId',v_item_id,'validation',v_validation);
end $function$;

revoke all on function public.matrix_explore_list(jsonb) from public;
revoke all on function public.matrix_explore_validation(jsonb) from public;
grant execute on function public.matrix_explore_list(jsonb) to anon, authenticated;
grant execute on function public.matrix_explore_validation(jsonb) to anon, authenticated;

commit;
