-- Deploy after the card-only recovery path. A complete analysis alone does not
-- prove that the current period's required card images have been published.
begin;
set local lock_timeout = '5s';

create or replace function private.matrix_card_publication_complete(p_lottery text, p_draw_period text)
returns boolean language sql stable security invoker set search_path = '' as $$
 select exists (
  select 1 from public.lottery_draws d
  join public.matrix_card_publications c on c.lottery = d.lottery
  where d.lottery = p_lottery and d.period = p_draw_period
    and d.result_status = 'confirmed'
    and p_draw_period ~ '^[0-9]{1,20}$'
    and (p_lottery = '天天樂' or (
      case when pg_catalog.jsonb_typeof(d.draw_order_numbers) = 'array'
        then pg_catalog.jsonb_array_length(d.draw_order_numbers) = case when p_lottery = '今彩539' then 5 else 7 end
        else false end
    ))
    and c.desired_period = p_draw_period
    and c.desired_digest ~ '^[0-9a-f]{64}$'
    and c.published_at is not null
    and pg_catalog.jsonb_typeof(c.manifest) = 'object'
    and c.manifest->>'lottery' = p_lottery
    and c.manifest->>'period' = p_draw_period
    and c.manifest->>'generation' = c.desired_digest
    and pg_catalog.jsonb_typeof(c.manifest->'cards') = 'object'
    and not exists (
      select 1
      from pg_catalog.unnest(case when p_lottery = '天天樂' then array['sorted']
        else array['sorted','draw'] end) required(card_order)
      cross join lateral (select c.manifest->'cards'->required.card_order as card) card_data
      cross join lateral (select card_data.card->>'url' as card_url,
        card_data.card->>'inputDigest' as input_digest) card_fields
      where pg_catalog.jsonb_typeof(card_data.card) is distinct from 'object'
        or card_data.card->>'mimeType' is distinct from 'image/png'
        or card_data.card->'width' is distinct from '2276'::jsonb
        or card_data.card->'height' is distinct from '3438'::jsonb
        or coalesce(card_data.card->>'sha256', '') !~ '^[0-9a-f]{64}$'
        or coalesce(card_fields.input_digest, '') !~ '^[0-9a-f]{64}$'
        or coalesce(card_fields.card_url, '') !~ (
          '^https://[^/?#[:space:]@]+/storage/v1/object/public/matrix-card-png/'
          || case p_lottery when '今彩539' then '539' when '天天樂' then 'fantasy5'
             when '六合彩' then 'marksix' when '大樂透' then 'lotto649' end
          || '/' || p_draw_period || '/' || card_fields.input_digest || '/'
          || required.card_order || '[.]png$'
        )
    )
 );
$$;
revoke all on function private.matrix_card_publication_complete(text,text) from public,anon,authenticated,service_role;

-- A corrected desired_period must be observed even when the image generation
-- stays unchanged; otherwise a valid manifest cannot satisfy the completion gate.
create or replace function public.observe_matrix_card_snapshot(
 p_lottery text, p_token uuid, p_digest text, p_period text
) returns boolean language plpgsql security invoker set search_path = '' as $$
begin
 if p_digest is null or p_digest !~ '^[0-9a-f]{64}$'
   or p_period is null or p_period !~ '^[0-9]{1,20}$' then
  raise exception 'CARD_SNAPSHOT_INVALID';
 end if;
 update public.matrix_card_publications
 set desired_digest = p_digest, desired_period = p_period,
     eligible_at = pg_catalog.clock_timestamp()
 where lottery = p_lottery and lease_token = p_token
   and lease_until > pg_catalog.clock_timestamp()
   and (desired_digest is distinct from p_digest or desired_period is distinct from p_period);
 return found;
end;
$$;
revoke all on function public.observe_matrix_card_snapshot(text,uuid,text,text) from public,anon,authenticated;
grant execute on function public.observe_matrix_card_snapshot(text,uuid,text,text) to service_role;

create or replace function public.matrix_watchdog_chain_state(p_lottery text, p_draw_period text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_analysis jsonb;
  v_matrix boolean;
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
  return pg_catalog.jsonb_build_object(
    'drawPeriod', p_draw_period, 'latestPeriod', v_latest,
    'analysis', v_analysis,
    'analysisComplete', coalesce(v_analysis->>'status' = 'complete' and v_version is not null, false),
    'matrixStatusComplete', coalesce(v_matrix, false),
    'cardComplete', private.matrix_card_publication_complete(p_lottery, p_draw_period),
    'observedAt', pg_catalog.now()
  );
end;
$$;

create or replace function private.matrix_primary_lottery_complete(
 p_lottery text,p_day date,p_now timestamptz
) returns boolean language plpgsql stable security definer set search_path='' as $$
declare v_draw public.lottery_draws; v_chain jsonb;
begin
 if private.matrix_recovery_draw_due(p_lottery,p_day,p_now) is false then return true; end if;
 select * into v_draw from public.lottery_draws where lottery=p_lottery
 order by draw_date desc nulls last,period desc limit 1;
 if not found or v_draw.draw_date is distinct from p_day
  or v_draw.result_status is distinct from 'confirmed' then return false; end if;
 v_chain:=public.matrix_watchdog_chain_state(p_lottery,v_draw.period);
 return coalesce(v_chain->>'latestPeriod'=v_draw.period
  and (v_chain->>'analysisComplete')::boolean is true
  and (v_chain->>'matrixStatusComplete')::boolean is true
  and (v_chain->>'cardComplete')::boolean is true,false);
exception when others then
 return false;
end $$;

create or replace function public.matrix_recovery_complete(p_lottery text,p_period text)
returns boolean language plpgsql security definer set search_path='' as $$
declare v_state private.matrix_recovery_schedule; v_draw public.lottery_draws; v_chain jsonb; v_group text;
begin
 v_group:=case when p_lottery='天天樂' then 'fantasy5' else 'evening' end;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('matrix-recovery:'||v_group));
 select * into v_state from private.matrix_recovery_schedule where lottery=p_lottery for update;
 if not found then return false; end if;
 if v_state.completed_at is not null then return true; end if;
 select * into v_draw from public.lottery_draws where lottery=p_lottery
 order by draw_date desc nulls last,period desc limit 1;
 if v_draw.period is distinct from p_period or v_draw.draw_date is distinct from v_state.cycle_date
  or v_draw.result_status is distinct from 'confirmed' then return false; end if;
 v_chain:=public.matrix_watchdog_chain_state(p_lottery,p_period);
 if v_chain->>'latestPeriod' is distinct from p_period
  or (v_chain->>'analysisComplete')::boolean is distinct from true
  or (v_chain->>'matrixStatusComplete')::boolean is distinct from true
  or (v_chain->>'cardComplete')::boolean is distinct from true then return false; end if;
 update private.matrix_recovery_schedule set completed_at=pg_catalog.clock_timestamp(),next_at=null,dispatched_at=null,last_error=null where lottery=p_lottery;
 perform private.matrix_recovery_replan(v_group);
 return true;
end $$;

create or replace function public.complete_matrix_watchdog_recovery(
 p_lottery text, p_owner_id text, p_runner_id text, p_draw_period text
) returns boolean language plpgsql security definer set search_path = '' set lock_timeout = '3s' as $$
declare v_chain jsonb;
begin
 -- Hold the same evidence until the completion record commits. Draw writes
 -- invalidate the card row, so acquire the card lock after the draw lock.
 lock table public.lottery_draws in share mode;
 lock table public.matrix_analysis_runs in share mode;
 lock table public.matrix_analysis_artifacts in share mode;
 lock table private.matrix_analysis_active_versions in share mode;
 lock table public.matrix_card_publications in share mode;
 perform 1 from public.matrix_watchdog_leases
 where lease_key='railway:'||p_lottery and owner_id=p_owner_id and runner_id=p_runner_id and expires_at>pg_catalog.clock_timestamp()
 for update;
 if not found then return false; end if;
 v_chain := public.matrix_watchdog_chain_state(p_lottery,p_draw_period);
 if v_chain->>'latestPeriod' is distinct from p_draw_period
   or (v_chain->>'analysisComplete')::boolean is distinct from true
   or (v_chain->>'matrixStatusComplete')::boolean is distinct from true
   or (v_chain->>'cardComplete')::boolean is distinct from true then return false; end if;
 if not exists (select 1 from public.matrix_watchdog_leases where lease_key='railway:'||p_lottery and owner_id=p_owner_id and runner_id=p_runner_id and expires_at>pg_catalog.clock_timestamp()) then return false; end if;
 update public.system_job_status set status='success',finished_at=now(),updated_at=now(),error=null,
   recovery_count=recovery_count+1,last_recovery_at=now(),written_period=p_draw_period
 where job_name='matrix-recovery:'||p_lottery;
 if not found then raise exception 'RECOVERY_START_MISSING'; end if;
 delete from public.matrix_watchdog_leases where lease_key='railway:'||p_lottery and owner_id=p_owner_id and runner_id=p_runner_id;
 return true;
end;
$$;

-- Replacing functions does not widen the existing service-only API.
revoke all on function public.matrix_watchdog_chain_state(text,text),
 public.complete_matrix_watchdog_recovery(text,text,text,text),
 public.matrix_recovery_complete(text,text),
 private.matrix_primary_lottery_complete(text,date,timestamptz)
 from public,anon,authenticated;
revoke all on function private.matrix_primary_lottery_complete(text,date,timestamptz)
 from service_role;
grant execute on function public.matrix_watchdog_chain_state(text,text),
 public.complete_matrix_watchdog_recovery(text,text,text,text),
 public.matrix_recovery_complete(text,text) to service_role;
notify pgrst, 'reload schema';
commit;
