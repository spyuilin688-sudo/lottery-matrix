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
  v_version text;
  v_draw text;
  v_payload jsonb;
  v_items jsonb;
  v_entitlements jsonb := private.matrix_result_entitlements();
begin
  if v_lottery not in ('今彩539', '天天樂', '六合彩', '大樂透')
    or pg_catalog.jsonb_typeof(v_streaks) <> 'array'
    or v_offset not in (0, 1, 2) then
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

  select coalesce(
    pg_catalog.jsonb_agg(
      item || pg_catalog.jsonb_build_object(
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
      )
      order by (item->>'highestStreak')::integer desc, item->>'id'
    ),
    '[]'::jsonb
  ) into v_items
  from pg_catalog.jsonb_array_elements(coalesce(v_payload->'items', '[]'::jsonb)) as item
  where v_streaks ? (item->>'consecutive');

  return pg_catalog.jsonb_build_object(
    'kind', 'tianyan',
    'lottery', v_lottery,
    'drawPeriod', v_draw,
    'analysisVersion', v_version,
    'exploreDateOffset', v_offset,
    'status', 'complete',
    'items', v_items,
    'total', pg_catalog.jsonb_array_length(v_items)
  );
end;
$$;

commit;
