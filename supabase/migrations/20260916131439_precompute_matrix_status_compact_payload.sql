begin;

alter table public.matrix_analysis_artifacts
  add column if not exists compact_payload jsonb;

create or replace function private.matrix_status_compact_payload(p_payload jsonb)
returns jsonb
language plpgsql
immutable
security definer
set search_path = ''
as $$
declare
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
  if p_payload is null
    or pg_catalog.jsonb_typeof(p_payload->'cards') is distinct from 'array' then
    return null;
  end if;

  for v_card in
    select card.value
    from pg_catalog.jsonb_array_elements(p_payload->'cards') as card(value)
  loop
    if pg_catalog.jsonb_typeof(v_card->'roads') is distinct from 'array' then
      return null;
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
    return p_payload - 'statusSources'::text;
  end if;

  if pg_catalog.jsonb_typeof(p_payload->'statusSources'->'explore'->'items') is distinct from 'array' then
    return null;
  end if;

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
    p_payload->'statusSources'->'explore'->'items'
  ) with ordinality as source(value, ordinality);

  for v_card in
    select card.value
    from pg_catalog.jsonb_array_elements(p_payload->'cards') as card(value)
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
            return null;
          end if;
          v_source_id := pg_catalog.left(
            v_source_id,
            pg_catalog.length(v_source_id) - pg_catalog.length(v_suffix)
          );
        end if;

        v_source_item := v_source_by_id->v_source_id;
        if v_source_item is null then
          return null;
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

  return (p_payload - 'statusSources'::text)
    || pg_catalog.jsonb_build_object('cards', v_cards);
end;
$$;

revoke all on function private.matrix_status_compact_payload(jsonb)
  from public, anon, authenticated;

update public.matrix_analysis_artifacts
set compact_payload = private.matrix_status_compact_payload(payload)
where kind = 'status';

create or replace function private.matrix_status_compact_artifact_sync()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.kind = 'status' then
    new.compact_payload := private.matrix_status_compact_payload(new.payload);
  else
    new.compact_payload := null;
  end if;
  return new;
end;
$$;

revoke all on function private.matrix_status_compact_artifact_sync()
  from public, anon, authenticated;

drop trigger if exists matrix_status_compact_artifact_sync
  on public.matrix_analysis_artifacts;
create trigger matrix_status_compact_artifact_sync
before insert or update of kind, payload
on public.matrix_analysis_artifacts
for each row
execute function private.matrix_status_compact_artifact_sync();

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
  v_compact jsonb;
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

  select artifact.compact_payload
    into v_compact
  from public.matrix_analysis_artifacts as artifact
  where artifact.kind = 'status'
    and artifact.lottery = v_lottery
    and artifact.draw_period = v_draw
    and artifact.analysis_version = coalesce(v_sorted, v_actual)
  limit 1;

  if v_compact is null then
    raise exception using errcode = 'P0001', message = 'ANALYSIS_NOT_READY';
  end if;

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
