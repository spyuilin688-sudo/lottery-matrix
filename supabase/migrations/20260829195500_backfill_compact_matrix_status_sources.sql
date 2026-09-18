begin;

with targets as (
  select status.id as status_id, status.lottery, status.draw_period, status.analysis_version
  from public.matrix_analysis_artifacts as status
  join public.matrix_analysis_runs as run
    on run.lottery = status.lottery
   and run.draw_period = status.draw_period
   and run.analysis_version = status.analysis_version
  where status.kind = 'status'
    and run.status = 'complete'
    and status.payload->'statusSources' is null
    and not exists (
      select 1
      from public.matrix_analysis_artifact_chunks as encoded
      where encoded.lottery = status.lottery
        and encoded.draw_period = status.draw_period
        and encoded.analysis_version = status.analysis_version
        and encoded.kind in ('explore', 'tianyan')
        and encoded.payload->>'encoding' is not null
    )
), raw_items as (
  select target.status_id, chunk.kind, item
  from targets as target
  join public.matrix_analysis_artifact_chunks as chunk
    on chunk.lottery = target.lottery
   and chunk.draw_period = target.draw_period
   and chunk.analysis_version = target.analysis_version
   and chunk.kind in ('explore', 'tianyan')
  cross join lateral pg_catalog.jsonb_array_elements(
    case when pg_catalog.jsonb_typeof(chunk.payload->'items') = 'array'
      then chunk.payload->'items' else '[]'::jsonb end
  ) as item
  union all
  select target.status_id, artifact.kind, item
  from targets as target
  join public.matrix_analysis_artifacts as artifact
    on artifact.lottery = target.lottery
   and artifact.draw_period = target.draw_period
   and artifact.analysis_version = target.analysis_version
   and artifact.kind in ('explore', 'tianyan')
   and coalesce(artifact.payload->>'storage', '') <> 'chunks'
  cross join lateral pg_catalog.jsonb_array_elements(
    case when pg_catalog.jsonb_typeof(artifact.payload->'items') = 'array'
      then artifact.payload->'items' else '[]'::jsonb end
  ) as item
), eligible as (
  select status_id, kind, item
  from raw_items
  where coalesce((item->>'exploreDateOffset')::integer, -1) = 0
    and coalesce((item->>'lockedSourceIndex')::integer, 99) < 13
), source_payloads as (
  select
    target.status_id,
    kind.name as kind,
    pg_catalog.jsonb_build_object(
      'lottery', target.lottery,
      'drawPeriod', target.draw_period,
      'items', coalesce(
        pg_catalog.jsonb_agg(
          case when kind.name = 'explore' then pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
            'id', eligible.item->'id',
            'number', eligible.item->'number',
            'lockedPosition', eligible.item->'lockedPosition',
            'predictionDistance', eligible.item->'predictionDistance',
            'consecutive', eligible.item->'consecutive',
            'highestStreak', eligible.item->'highestStreak',
            'predictionNumbers', eligible.item->'predictionNumbers',
            'algorithmType', eligible.item->'algorithmType',
            'numberOrder', eligible.item->'numberOrder',
            'explorePeriods', eligible.item->'explorePeriods',
            'exploreDateOffset', eligible.item->'exploreDateOffset',
            'ruleCount', eligible.item->'ruleCount',
            'lockedSourceIndex', eligible.item->'lockedSourceIndex'
          )) else pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
            'id', eligible.item->'id',
            'number', eligible.item->'number',
            'lockedPosition', eligible.item->'lockedPosition',
            'predictionDistance', eligible.item->'predictionDistance',
            'consecutive', eligible.item->'consecutive',
            'highestStreak', eligible.item->'highestStreak',
            'predictionNumbers', eligible.item->'predictionNumbers',
            'numberOrder', eligible.item->'numberOrder',
            'explorePeriods', eligible.item->'explorePeriods',
            'exploreDateOffset', eligible.item->'exploreDateOffset',
            'lockedSourceIndex', eligible.item->'lockedSourceIndex'
          )) end
          order by eligible.item->>'id'
        ) filter (where eligible.item is not null),
        '[]'::jsonb
      )
    ) as payload
  from targets as target
  cross join (values ('explore'), ('tianyan')) as kind(name)
  left join eligible
    on eligible.status_id = target.status_id and eligible.kind = kind.name
  group by target.status_id, target.lottery, target.draw_period, kind.name
), compact_sources as (
  select status_id, pg_catalog.jsonb_object_agg(kind, payload) as payload
  from source_payloads
  group by status_id
)
update public.matrix_analysis_artifacts as status
set payload = pg_catalog.jsonb_set(status.payload, '{statusSources}', compact_sources.payload, true)
from compact_sources
where status.id = compact_sources.status_id;

commit;
