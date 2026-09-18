begin;

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
  v_offset integer := coalesce((p_request->>'exploreDateOffset')::integer, 0);
  v_streaks jsonb := coalesce(p_request->'selectedStreaks', '[]'::jsonb);
  v_same boolean := coalesce((p_request->>'sameCode')::boolean, false);
  v_prediction_number text := nullif(pg_catalog.btrim(p_request->>'predictionNumber'), '');
  v_version text;
  v_draw text;
  v_payload jsonb;
  v_items jsonb;
  v_stats jsonb;
  v_total integer;
  v_entitlements jsonb := private.matrix_result_entitlements();
begin
  if v_lottery not in ('今彩539', '天天樂', '六合彩', '大樂透')
    or pg_catalog.jsonb_typeof(v_streaks) <> 'array'
    or v_offset not in (0, 1, 2)
    or (v_prediction_number is not null and v_prediction_number !~ '^(0[1-9]|[1-4][0-9])$') then
    raise exception using errcode = '22023', message = 'INVALID_REQUEST';
  end if;

  if (v_entitlements->>'canUseTianyan')::boolean is not true then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  with latest_versions as (
    select distinct on (run.draw_period)
      run.analysis_version,
      run.draw_period,
      draw.draw_date,
      run.completed_at
    from public.matrix_analysis_runs as run
    left join public.lottery_draws as draw
      on draw.lottery = run.lottery
     and draw.period = run.draw_period
    where run.lottery = v_lottery
      and run.status = 'complete'
      and (v_period is null or run.draw_period = v_period)
    order by run.draw_period, run.completed_at desc nulls last
  )
  select analysis_version, draw_period into v_version, v_draw
  from latest_versions
  order by
    (draw_date is not null) desc,
    draw_date desc nulls last,
    draw_period desc,
    completed_at desc nulls last
  offset v_offset
  limit 1;

  if v_version is null then
    raise exception using errcode = 'P0001', message = 'ANALYSIS_NOT_READY';
  end if;

  v_payload := private.matrix_artifact_payload('tianyan', v_lottery, v_draw, v_version);
  if v_payload is null then
    raise exception using errcode = 'P0001', message = 'ANALYSIS_NOT_READY';
  end if;

  with labeled as (
    select item || pg_catalog.jsonb_build_object(
      'roadTypeLabel',
      case
        when v_payload->'validationById'->(item->>'id')->'rules'->0->>'algorithmType' = '加減'
         and v_payload->'validationById'->(item->>'id')->'rules'->1->>'algorithmType' = '加減' then '加減版路'
        when v_payload->'validationById'->(item->>'id')->'rules'->0->>'algorithmType' = '合值'
         and v_payload->'validationById'->(item->>'id')->'rules'->1->>'algorithmType' = '合值' then '合值版路'
        when v_payload->'validationById'->(item->>'id')->'rules'->0->>'algorithmType' = '拖牌'
         and v_payload->'validationById'->(item->>'id')->'rules'->1->>'algorithmType' = '拖牌' then '拖牌版路'
        when (v_payload->'validationById'->(item->>'id')->'rules'->0->>'algorithmType' = '加減'
          and v_payload->'validationById'->(item->>'id')->'rules'->1->>'algorithmType' = '合值')
          or (v_payload->'validationById'->(item->>'id')->'rules'->0->>'algorithmType' = '合值'
          and v_payload->'validationById'->(item->>'id')->'rules'->1->>'algorithmType' = '加減') then '加減合值'
        when (v_payload->'validationById'->(item->>'id')->'rules'->0->>'algorithmType' = '加減'
          and v_payload->'validationById'->(item->>'id')->'rules'->1->>'algorithmType' = '拖牌')
          or (v_payload->'validationById'->(item->>'id')->'rules'->0->>'algorithmType' = '拖牌'
          and v_payload->'validationById'->(item->>'id')->'rules'->1->>'algorithmType' = '加減') then '加減拖牌'
        when (v_payload->'validationById'->(item->>'id')->'rules'->0->>'algorithmType' = '合值'
          and v_payload->'validationById'->(item->>'id')->'rules'->1->>'algorithmType' = '拖牌')
          or (v_payload->'validationById'->(item->>'id')->'rules'->0->>'algorithmType' = '拖牌'
          and v_payload->'validationById'->(item->>'id')->'rules'->1->>'algorithmType' = '合值') then '合值拖牌'
      end
    ) as item
    from pg_catalog.jsonb_array_elements(coalesce(v_payload->'items', '[]'::jsonb)) as item
    where v_streaks ? (item->>'consecutive')
  ), same_groups as (
    select labeled.item->'predictionNumbers' as prediction_numbers
    from labeled
    group by labeled.item->'predictionNumbers'
    having pg_catalog.count(*) > 1
  ), same_allowed as (
    select labeled.item
    from labeled
    where not v_same
      or exists (
        select 1
        from same_groups
        where same_groups.prediction_numbers = labeled.item->'predictionNumbers'
      )
  ), filtered as (
    select same_allowed.item
    from same_allowed
    where v_prediction_number is null
      or same_allowed.item->'predictionNumbers' ? v_prediction_number
  )
  select
    coalesce(
      pg_catalog.jsonb_agg(
        filtered.item
        order by
          case when v_same or v_prediction_number is not null then (filtered.item->'predictionNumbers')::text else '' end,
          (filtered.item->>'highestStreak')::integer desc,
          (filtered.item->>'predictionDistance')::integer,
          (filtered.item->>'lockedPosition')::integer,
          filtered.item->>'id'
      ),
      '[]'::jsonb
    ),
    pg_catalog.count(*)::integer
  into v_items, v_total
  from filtered;

  with labeled as (
    select item
    from pg_catalog.jsonb_array_elements(coalesce(v_payload->'items', '[]'::jsonb)) as item
    where v_streaks ? (item->>'consecutive')
  ), same_groups as (
    select labeled.item->'predictionNumbers' as prediction_numbers
    from labeled
    group by labeled.item->'predictionNumbers'
    having pg_catalog.count(*) > 1
  ), same_allowed as (
    select labeled.item
    from labeled
    where not v_same
      or exists (
        select 1
        from same_groups
        where same_groups.prediction_numbers = labeled.item->'predictionNumbers'
      )
  ), number_counts as (
    select prediction_number.number, pg_catalog.count(*)::integer as count
    from same_allowed
    cross join lateral pg_catalog.jsonb_array_elements_text(same_allowed.item->'predictionNumbers') as prediction_number(number)
    group by prediction_number.number
  ), top_numbers as (
    select number, count
    from number_counts
    order by count desc, number::integer
    limit 18
  )
  select coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object('number', number, 'count', count)
      order by count desc, number::integer
    ),
    '[]'::jsonb
  ) into v_stats
  from top_numbers;

  return pg_catalog.jsonb_build_object(
    'kind', 'tianyan',
    'lottery', v_lottery,
    'drawPeriod', v_draw,
    'analysisVersion', v_version,
    'exploreDateOffset', v_offset,
    'status', 'complete',
    'items', v_items,
    'duplicateStats', v_stats,
    'total', v_total
  );
exception
  when invalid_text_representation or numeric_value_out_of_range then
    raise exception using errcode = '22023', message = 'INVALID_REQUEST';
end;
$$;

commit;
