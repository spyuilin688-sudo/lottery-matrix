begin;
alter table public.system_job_status
  add column if not exists retry_count bigint not null default 0 check (retry_count >= 0),
  add column if not exists recovery_count bigint not null default 0 check (recovery_count >= 0),
  add column if not exists last_recovery_at timestamptz;

-- One start per existing lease. All writes below share this transaction.
create or replace function public.begin_matrix_watchdog_recovery(
 p_lease_key text, p_owner_id text, p_runner_id text, p_ttl_seconds integer
) returns boolean language plpgsql security definer set search_path = '' as $$
declare v_lottery text := pg_catalog.substr(p_lease_key, 9);
begin
 if p_lease_key <> 'railway:' || v_lottery or v_lottery not in ('今彩539','天天樂','六合彩','大樂透')
   or nullif(pg_catalog.btrim(p_runner_id),'') is null or p_ttl_seconds not between 60 and 3600 then
   raise exception 'INVALID_WATCHDOG_LEASE';
 end if;
 update public.matrix_watchdog_leases set runner_id=p_runner_id, recovery_started_at=now(),
   expires_at=now()+pg_catalog.make_interval(secs=>p_ttl_seconds)
 where lease_key=p_lease_key and owner_id=p_owner_id and runner_id is null and expires_at>now();
 if not found then return false; end if;
 insert into public.system_job_status(job_name,lottery,status,started_at,updated_at,retry_count)
 values ('matrix-recovery:'||v_lottery,v_lottery,'running',now(),now(),1)
 on conflict (job_name) do update set status='running',started_at=now(),finished_at=null,error=null,
   updated_at=now(),retry_count=public.system_job_status.retry_count+1;
 return true;
end;
$$;

create function public.complete_matrix_watchdog_recovery(
 p_lottery text, p_owner_id text, p_runner_id text, p_draw_period text
) returns boolean language plpgsql security definer set search_path = '' set lock_timeout = '3s' as $$
declare v_chain jsonb;
begin
 -- Fence the evidence until the success record commits. Keep draw -> active
 -- version -> config order consistent with publication and source invalidation.
 lock table public.lottery_draws in share mode;
 lock table public.matrix_analysis_runs in share mode;
 lock table public.matrix_analysis_artifacts in share mode;
 lock table private.matrix_analysis_active_versions in share mode;
 lock table public.matrix_custom_status_configs in share mode;
 lock table public.matrix_custom_status_results in share mode;
 perform 1 from public.matrix_watchdog_leases
 where lease_key='railway:'||p_lottery and owner_id=p_owner_id and runner_id=p_runner_id and expires_at>pg_catalog.clock_timestamp()
 for update;
 if not found then return false; end if;
 v_chain := public.matrix_watchdog_chain_state(p_lottery,p_draw_period);
 if v_chain->>'latestPeriod' is distinct from p_draw_period
   or (v_chain->>'analysisComplete')::boolean is distinct from true
   or (v_chain->>'matrixStatusComplete')::boolean is distinct from true
   or (v_chain->>'customStatusComplete')::boolean is distinct from true then return false; end if;
 if not exists (select 1 from public.matrix_watchdog_leases where lease_key='railway:'||p_lottery and owner_id=p_owner_id and runner_id=p_runner_id and expires_at>pg_catalog.clock_timestamp()) then return false; end if;
 update public.system_job_status set status='success',finished_at=now(),updated_at=now(),error=null,
   recovery_count=recovery_count+1,last_recovery_at=now(),written_period=p_draw_period
 where job_name='matrix-recovery:'||p_lottery;
 if not found then raise exception 'RECOVERY_START_MISSING'; end if;
 delete from public.matrix_watchdog_leases where lease_key='railway:'||p_lottery and owner_id=p_owner_id and runner_id=p_runner_id;
 return true;
end;
$$;

-- Release without verified completion is a failed attempt, never a success.
create or replace function public.finish_matrix_watchdog_recovery(p_lease_key text,p_owner_id text,p_runner_id text)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
 delete from public.matrix_watchdog_leases where lease_key=p_lease_key and owner_id=p_owner_id and runner_id=p_runner_id;
 if not found then return false; end if;
 update public.system_job_status set status='failed',finished_at=now(),updated_at=now(),error='RECOVERY_NOT_VERIFIED'
 where job_name='matrix-recovery:'||pg_catalog.substr(p_lease_key,9);
 return true;
end;
$$;
revoke all on function public.begin_matrix_watchdog_recovery(text,text,text,integer) from public,anon,authenticated;
revoke all on function public.complete_matrix_watchdog_recovery(text,text,text,text) from public,anon,authenticated;
revoke all on function public.finish_matrix_watchdog_recovery(text,text,text) from public,anon,authenticated;
grant execute on function public.begin_matrix_watchdog_recovery(text,text,text,integer) to service_role;
grant execute on function public.complete_matrix_watchdog_recovery(text,text,text,text) to service_role;
grant execute on function public.finish_matrix_watchdog_recovery(text,text,text) to service_role;
notify pgrst,'reload schema';
commit;
