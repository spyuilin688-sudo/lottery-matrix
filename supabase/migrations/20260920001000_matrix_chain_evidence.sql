begin;
-- Compare the JSON represented by the existing config_key, never a second hash.
create or replace function private.matrix_custom_status_key_matches(p_key text, p_configs jsonb)
returns boolean language plpgsql immutable set search_path = '' as $$
begin
  return p_key::jsonb = p_configs;
exception when invalid_text_representation then return false;
end;
$$;

create or replace function public.matrix_watchdog_chain_state(p_lottery text, p_draw_period text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_analysis jsonb;
  v_matrix boolean;
  v_members bigint;
  v_missing bigint;
  v_config_mismatches bigint;
  v_version text;
  v_latest text;
begin
  v_analysis := public.matrix_watchdog_analysis_state(p_lottery, p_draw_period);
  select period into v_latest from public.lottery_draws where lottery = p_lottery
    order by draw_date desc nulls last, period desc limit 1;
  v_version := v_analysis->'activeVersions'->>'sorted';
  v_matrix := v_version is not null and not exists (
    select 1 from pg_catalog.jsonb_each_text(v_analysis->'activeVersions') active
    where not exists (select 1 from public.matrix_analysis_artifacts a
      where a.lottery = p_lottery and a.draw_period = p_draw_period
      and a.analysis_version = active.value and a.kind = 'status')
  );
  with configs as (
    select member_id, pg_catalog.jsonb_agg(
      private.matrix_custom_status_normalize_config(config, true) order by status collate "C"
    ) as expected
    from public.matrix_custom_status_configs where lottery = p_lottery group by member_id
  )
  select count(*), count(*) filter (where r.member_id is null
    or r.draw_period is distinct from p_draw_period
    or r.analysis_version is distinct from v_version
    or not private.matrix_custom_status_key_matches(r.config_key, c.expected))
  , count(*) filter (where r.member_id is not null and not private.matrix_custom_status_key_matches(r.config_key,c.expected))
  into v_members, v_missing, v_config_mismatches from configs c left join public.matrix_custom_status_results r
    on r.member_id = c.member_id and r.lottery = p_lottery;
  return pg_catalog.jsonb_build_object(
    'drawPeriod', p_draw_period, 'latestPeriod', v_latest,
    'analysis', v_analysis,
    'analysisComplete', coalesce(v_analysis->>'status' = 'complete' and v_version is not null, false),
    'matrixStatusComplete', coalesce(v_matrix, false),
    'customConfigMismatches',v_config_mismatches,
    'customStatusComplete', v_missing = 0, 'customMembers', v_members, 'customMissing', v_missing,
    'observedAt', pg_catalog.now()
  );
end;
$$;
revoke all on function private.matrix_custom_status_key_matches(text,jsonb) from public, anon, authenticated;
revoke all on function public.matrix_watchdog_chain_state(text,text) from public, anon, authenticated;
grant execute on function public.matrix_watchdog_chain_state(text,text) to service_role;
notify pgrst, 'reload schema';
commit;
