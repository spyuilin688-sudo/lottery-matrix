begin;

alter table public.members add column line_trial_started_at timestamptz;

comment on column public.members.line_trial_started_at is
  'Server-recorded first LINE member registration: Tianyan 48 hours, Tiangong 24 hours. Existing members are not backfilled.';

create or replace function private.initialize_line_registration_trial()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.line_trial_started_at := null;
  if coalesce(new.status, '') not in ('停用', 'disabled', 'inactive') and exists (
    select 1 from auth.identities as identity
    where identity.user_id = new.auth_user_id
      and identity.provider = 'custom:line'
      and nullif(pg_catalog.btrim(identity.provider_id), '') = new.line_user_id
  ) then
    new.line_trial_started_at := pg_catalog.now();
  end if;
  return new;
end;
$$;
revoke all on function private.initialize_line_registration_trial() from public, anon, authenticated;

create trigger initialize_line_registration_trial
before insert on public.members
for each row execute function private.initialize_line_registration_trial();

CREATE OR REPLACE FUNCTION private.matrix_result_entitlements()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    if not found or coalesce(v_member.status, '') in ('停用', 'disabled', 'inactive') then
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
      v_plan := coalesce(v_plan, 'free');
      v_paid := v_plan <> 'free'
        and coalesce(v_member.plan_expires_at > pg_catalog.now(), false);
    end if;
    if coalesce(v_member.referral_code, '') <> '' then
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
    'canUseSeven', v_paid or v_referrals >= 15 or (v_uid is not null and nullif(pg_catalog.btrim(v_member.line_user_id), '') is not null and v_dow in (2, 5)) or (v_referrals >= 10 and v_dow in (1, 4)),
    'canUseThirteen', v_paid,
    'canUseFullRange', v_paid or v_referrals >= 50 or (v_referrals >= 30 and v_dow in (2, 5)),
    'canUseTianyan', (v_paid and v_plan in ('quarterly', 'yearly', 'lifetime')) or coalesce(v_member.line_trial_started_at <= pg_catalog.now() and v_member.line_trial_started_at + interval '48 hours' > pg_catalog.now(), false),
    'canUseTiangong', (v_paid and v_plan in ('yearly', 'lifetime')) or coalesce(v_member.line_trial_started_at <= pg_catalog.now() and v_member.line_trial_started_at + interval '24 hours' > pg_catalog.now(), false),
    'canViewFullStatus', v_paid,
    'canCustomizeStatus', v_paid and v_plan <> 'trial',
    'canUseCompositeCustomRoad', v_paid and v_plan in ('quarterly', 'yearly', 'lifetime')
  );
end;
$function$
;


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
  v_periods integer := coalesce((p_request->>'explorePeriods')::integer, 13);
  v_range text := coalesce(p_request->>'exploreRange', '完整範圍');
  v_order text := coalesce(p_request->>'numberOrder', '依號碼由小到大排序');
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
    or v_periods not in (2, 7, 13)
    or v_range not in ('標準範圍', '完整範圍')
    or v_order not in ('依號碼由小到大排序', '依實際開獎順序排序')
    or v_offset not in (0, 1, 2)
    or (v_prediction_number is not null and v_prediction_number !~ '^(0[1-9]|[1-4][0-9])$') then
    raise exception using errcode = '22023', message = 'INVALID_REQUEST';
  end if;

  -- Tianyan access includes its own period/range settings. Registration trials
  -- must not grant those settings to the separate Matrix Explore algorithm.
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


  -- Apply the requested search before both list and duplicate-number aggregation.
  select pg_catalog.jsonb_set(v_payload, '{items}', coalesce(pg_catalog.jsonb_agg(
    item || pg_catalog.jsonb_build_object('explorePeriods', v_periods, 'exploreDateOffset', v_offset)
  ), '[]'::jsonb)) into v_payload
  from pg_catalog.jsonb_array_elements(coalesce(v_payload->'items', '[]'::jsonb)) as item
  where item->>'numberOrder' = v_order
    and (item->>'lockedSourceIndex')::integer >= 0
    and (item->>'lockedSourceIndex')::integer < v_periods
    and pg_catalog.jsonb_array_length(v_payload->'validationById'->(item->>'id')->'rules') = 2
    and not exists (
      select 1
      from pg_catalog.jsonb_array_elements(v_payload->'validationById'->(item->>'id')->'rules') as rule
      where coalesce((rule->>'referenceOffset')::integer,
                     (rule->>'validationPeriodOffset')::integer) is null
        or coalesce((rule->>'referenceOffset')::integer,
                    (rule->>'validationPeriodOffset')::integer) < case when v_range = '標準範圍' then -7 else -14 end
        or coalesce((rule->>'referenceOffset')::integer,
                    (rule->>'validationPeriodOffset')::integer) >= (item->>'predictionDistance')::integer
    );

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
