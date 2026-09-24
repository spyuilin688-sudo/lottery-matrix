begin;

create or replace function public.matrix_status_compact_get(p_request jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_lottery text := nullif(pg_catalog.btrim(p_request->>'lottery'), '');
  v_period text := nullif(pg_catalog.btrim(p_request->>'drawPeriod'), '');
  v_draw text;
  v_sorted text;
  v_actual text;
  v_version text;
  v_payload jsonb;
  v_compact jsonb;
  v_cards jsonb := '[]'::jsonb;
  v_card jsonb;
  v_roads jsonb;
  v_road jsonb;
  v_source_item jsonb;
  v_source_by_id jsonb := '{}'::jsonb;
  v_source_id text;
  v_suffix text;
  v_needs_legacy_lookup boolean := false;
begin
  if pg_catalog.jsonb_typeof(p_request) is distinct from 'object'
    or v_lottery is null
    or v_lottery not in ('今彩539', '天天樂', '六合彩', '大樂透') then
    raise exception using errcode = '22023', message = 'INVALID_REQUEST';
  end if;

  v_draw := private.matrix_analysis_read_period(v_lottery, v_period, 0);
  if v_draw is null then
    raise exception using errcode = 'P0001', message = 'ANALYSIS_NOT_READY';
  end if;

  v_sorted := private.matrix_analysis_order_version(
    v_lottery, v_draw, '依號碼由小到大排序', 'status'
  );
  v_actual := private.matrix_analysis_order_version(
    v_lottery, v_draw, '依實際開獎順序排序', 'status'
  );
  if v_sorted is null and v_actual is null then
    raise exception using errcode = 'P0001', message = 'ANALYSIS_NOT_READY';
  end if;

  v_version := case
    when v_sorted is not null and v_actual is not null and v_sorted <> v_actual
      then v_draw || ':matrix-active:'
        || pg_catalog.md5(pg_catalog.jsonb_build_array(v_sorted, v_actual)::text)
    else coalesce(v_sorted, v_actual)
  end;

  v_payload := private.matrix_artifact_payload(
    'status', v_lottery, v_draw, coalesce(v_sorted, v_actual)
  );
  if v_payload is null
    or pg_catalog.jsonb_typeof(v_payload->'cards') is distinct from 'array'
    or pg_catalog.jsonb_typeof(v_payload->'statusSources'->'explore'->'items') is distinct from 'array' then
    raise exception using errcode = 'P0001', message = 'ANALYSIS_NOT_READY';
  end if;

  -- New status artifacts persist validation/source coordinates directly on
  -- each road. Scan only cards/roads to detect whether this artifact still
  -- needs the legacy source lookup; never rescan explore.items per road.
  for v_card in
    select card.value
    from pg_catalog.jsonb_array_elements(v_payload->'cards') as card(value)
  loop
    if pg_catalog.jsonb_typeof(v_card->'roads') is distinct from 'array' then
      raise exception using errcode = 'P0001', message = 'ANALYSIS_NOT_READY';
    end if;

    if exists (
      select 1
      from pg_catalog.jsonb_array_elements(v_card->'roads') as road(value)
      where nullif(road.value->>'validationItemId', '') is null
    ) then
      v_needs_legacy_lookup := true;
    end if;
  end loop;

  if not v_needs_legacy_lookup then
    v_compact := v_payload - 'statusSources'::text;
    return pg_catalog.jsonb_build_object(
      'analysisVersion', v_version,
      'drawPeriod', v_draw,
      'payload', v_compact
    );
  end if;

  -- Legacy artifacts do not carry validationItemId on roads. Build one
  -- source-id map once, then resolve every road by O(1) JSON object lookup.
  select coalesce(
    pg_catalog.jsonb_object_agg(
      source.value->>'id',
      source.value
      order by source.ordinality desc
    ) filter (where nullif(source.value->>'id', '') is not null),
    '{}'::jsonb
  )
    into v_source_by_id
  from pg_catalog.jsonb_array_elements(
    v_payload->'statusSources'->'explore'->'items'
  ) with ordinality as source(value, ordinality);

  for v_card in
    select card.value
    from pg_catalog.jsonb_array_elements(v_payload->'cards') as card(value)
  loop
    v_roads := '[]'::jsonb;

    for v_road in
      select road.value
      from pg_catalog.jsonb_array_elements(v_card->'roads') as road(value)
    loop
      if nullif(v_road->>'validationItemId', '') is null then
        v_source_id := v_road->>'id';
        if v_road->>'hitType' = 'one-code' then
          v_suffix := ':' || coalesce(v_road->'result'->>0, '');
          if pg_catalog.right(v_source_id, pg_catalog.length(v_suffix)) <> v_suffix then
            raise exception using errcode = 'P0001', message = 'ANALYSIS_NOT_READY';
          end if;
          v_source_id := pg_catalog.left(
            v_source_id,
            pg_catalog.length(v_source_id) - pg_catalog.length(v_suffix)
          );
        end if;

        v_source_item := v_source_by_id->v_source_id;
        if v_source_item is null then
          raise exception using errcode = 'P0001', message = 'ANALYSIS_NOT_READY';
        end if;

        v_road := v_road || pg_catalog.jsonb_build_object(
          'validationItemId', v_source_item->>'id'
        );
        if v_source_item ? 'referenceOffset' then
          v_road := v_road || pg_catalog.jsonb_build_object(
            'referenceOffset', v_source_item->'referenceOffset'
          );
        end if;
        if v_source_item ? 'referencePosition' then
          v_road := v_road || pg_catalog.jsonb_build_object(
            'referencePosition', v_source_item->'referencePosition'
          );
        end if;
      end if;

      v_roads := v_roads || pg_catalog.jsonb_build_array(v_road);
    end loop;

    v_cards := v_cards || pg_catalog.jsonb_build_array(
      (v_card - 'roads'::text) || pg_catalog.jsonb_build_object('roads', v_roads)
    );
  end loop;

  v_compact := (v_payload - 'statusSources'::text)
    || pg_catalog.jsonb_build_object('cards', v_cards);

  return pg_catalog.jsonb_build_object(
    'analysisVersion', v_version,
    'drawPeriod', v_draw,
    'payload', v_compact
  );
end;
$$;

revoke all on function public.matrix_status_compact_get(jsonb)
  from public, anon, authenticated;
grant execute on function public.matrix_status_compact_get(jsonb)
  to service_role;

commit;
