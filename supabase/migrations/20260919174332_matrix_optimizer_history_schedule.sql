begin;
-- Observation history only: operational status/counters and leases retain their existing owners.
create table private.matrix_optimizer_observations (
 scope text not null check(scope in ('railway','database')),
 slot timestamptz not null,
 observed_at timestamptz not null,
 report jsonb not null,
 evidence jsonb not null,
 primary key(scope,slot),
 check(jsonb_typeof(report)='object' and jsonb_typeof(evidence)='object'),
 check(octet_length(report::text)+octet_length(evidence::text)<=524288)
);
alter table private.matrix_optimizer_observations enable row level security;
revoke all on private.matrix_optimizer_observations from public,anon,authenticated,service_role;

create function private.matrix_optimizer_prune() returns integer
language plpgsql security definer set search_path='' as $$
declare affected integer;
begin
 delete from private.matrix_optimizer_observations where observed_at < now()-interval '90 days';
 get diagnostics affected=row_count; return affected;
end $$;

create function public.matrix_optimizer_claim(p_scope text,p_owner_id text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_slot timestamptz;
begin
 if p_scope is null or p_scope not in ('railway','database') then raise exception 'OPTIMIZER_SCOPE_INVALID';end if;
 v_slot:=case when p_scope='railway' then date_trunc('hour',now() at time zone 'UTC') at time zone 'UTC'
 else date_trunc('day',now() at time zone 'Asia/Taipei') at time zone 'Asia/Taipei' end;
 if exists(select 1 from private.matrix_optimizer_observations where scope=p_scope and slot=v_slot)
 then return jsonb_build_object('acquired',false);end if;
 if not public.claim_matrix_watchdog_lease('optimizer:'||p_scope,p_owner_id,300)
 then return jsonb_build_object('acquired',false);end if;
 if exists(select 1 from private.matrix_optimizer_observations where scope=p_scope and slot=v_slot) then
 perform public.release_matrix_watchdog_lease('optimizer:'||p_scope,p_owner_id);
 return jsonb_build_object('acquired',false);end if;
 return jsonb_build_object('acquired',true,'slot',v_slot,'observedAt',now());
end $$;

create function public.matrix_optimizer_finish(p_scope text,p_slot timestamptz,p_owner_id text,p_report jsonb,p_evidence jsonb) returns boolean
language plpgsql security definer set search_path='' as $$
declare v_acquired timestamptz;v_expected timestamptz;
begin
 if p_scope is null or p_scope not in ('railway','database') then raise exception 'OPTIMIZER_SCOPE_INVALID';end if;
 select acquired_at into v_acquired from public.matrix_watchdog_leases
 where lease_key='optimizer:'||p_scope and owner_id=p_owner_id and runner_id is null and expires_at>clock_timestamp() for update;
 if not found then return false;end if;
 v_expected:=case when p_scope='railway' then date_trunc('hour',v_acquired at time zone 'UTC') at time zone 'UTC'
 else date_trunc('day',v_acquired at time zone 'Asia/Taipei') at time zone 'Asia/Taipei' end;
 if p_slot is distinct from v_expected then return false;end if;
 if p_report is null or p_evidence is null or jsonb_typeof(p_report)<>'object' or jsonb_typeof(p_evidence)<>'object'
 or octet_length(p_report::text)+octet_length(p_evidence::text)>524288
 or nullif(p_report->>'checkedAt','') is null then raise exception 'OPTIMIZER_REPORT_INVALID';end if;
 if (p_report->>'checkedAt')::timestamptz < v_acquired-interval '5 minutes'
 or (p_report->>'checkedAt')::timestamptz > clock_timestamp()+interval '1 minute' then raise exception 'OPTIMIZER_REPORT_INVALID';end if;
 insert into private.matrix_optimizer_observations values(p_scope,p_slot,clock_timestamp(),p_report,p_evidence) on conflict do nothing;
 perform public.release_matrix_watchdog_lease('optimizer:'||p_scope,p_owner_id);
 perform private.matrix_optimizer_prune();
 return true;
end $$;

create function public.matrix_optimizer_latest(p_scope text) returns jsonb
language sql stable security definer set search_path='' as $$
 select report from private.matrix_optimizer_observations where scope=p_scope and observed_at>=now()-interval '90 days' order by slot desc limit 1
$$;
create function public.matrix_optimizer_history(p_scope text,p_before timestamptz default null,p_limit integer default 24) returns jsonb
language sql stable security definer set search_path='' as $$
 with page as (select slot,observed_at,report from private.matrix_optimizer_observations
 where scope=p_scope and observed_at>=now()-interval '90 days' and (p_before is null or slot<p_before)
 order by slot desc limit greatest(1,least(coalesce(p_limit,24),100)))
 select jsonb_build_object('items',coalesce(jsonb_agg(jsonb_build_object('slot',slot,'observedAt',observed_at,'report',report) order by slot desc),'[]'::jsonb),'nextBefore',min(slot)) from page
$$;
-- PL/pgSQL resolves the additive recovery counter columns at execution after all migrations.
create function public.matrix_optimizer_job_counters() returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 select jsonb_build_object('jobs',coalesce(jsonb_agg(to_jsonb(s)),'[]'::jsonb)) into result from (
 select job_name,lottery,status,retry_count,recovery_count,last_recovery_at,started_at,finished_at from public.system_job_status order by job_name limit 32) s;
 return result;
end $$;

create function private.matrix_optimizer_http_tick(p_scope text) returns bigint
language plpgsql security definer set search_path='' as $$
declare v_url text;v_token text;v_request bigint;
begin
 if p_scope is null or p_scope not in ('railway','database') then raise exception 'OPTIMIZER_SCOPE_INVALID';end if;
 perform private.matrix_optimizer_prune();
 select decrypted_secret into v_url from vault.decrypted_secrets where name='matrix_project_url' limit 1;
 select decrypted_secret into v_token from vault.decrypted_secrets where name='matrix_admin_watchdog_token' limit 1;
 if nullif(trim(v_url),'') is null or nullif(trim(v_token),'') is null then return null;end if;
 select net.http_post(url:=rtrim(v_url,'/')||'/functions/v1/admin-api/api/internal/matrix-watchdog',
 headers:=jsonb_build_object('Content-Type','application/json','x-matrix-watchdog-token',v_token),
 body:=jsonb_build_object('optimizer',true,'optimizerScope',p_scope),timeout_milliseconds:=120000) into v_request;
 return v_request;
end $$;

create or replace function public.admin_watchdog_status_write(p_status jsonb) returns boolean
language plpgsql set search_path='' as $$
begin
 p_status:=p_status-'optimizer';
 if p_status is null or jsonb_typeof(p_status)<>'object' or octet_length(p_status::text)>262144
 or coalesce(p_status->>'status','') not in ('ok','degraded') then raise exception 'INVALID_WATCHDOG_STATUS' using errcode='22023';end if;
 insert into private.admin_watchdog_status(id,status,updated_at) values(true,p_status-'id',now())
 on conflict(id) do update set status=excluded.status,updated_at=excluded.updated_at;return true;
end $$;
update private.admin_watchdog_status set status=status-'optimizer' where status?'optimizer';

revoke all on function private.matrix_optimizer_prune(),private.matrix_optimizer_http_tick(text),
 public.matrix_optimizer_claim(text,text),public.matrix_optimizer_finish(text,timestamptz,text,jsonb,jsonb),
 public.matrix_optimizer_latest(text),public.matrix_optimizer_history(text,timestamptz,integer),public.matrix_optimizer_job_counters() from public,anon,authenticated;
grant execute on function public.matrix_optimizer_claim(text,text),public.matrix_optimizer_finish(text,timestamptz,text,jsonb,jsonb),
 public.matrix_optimizer_latest(text),public.matrix_optimizer_history(text,timestamptz,integer),public.matrix_optimizer_job_counters() to service_role;
-- Activation is a deployment step, after the receiving Edge Function and all migrations exist.
select cron.alter_job(cron.schedule('matrix-optimizer-railway-v1','0 * * * *',$job$select private.matrix_optimizer_http_tick('railway');$job$),active:=false);
select cron.alter_job(cron.schedule('matrix-optimizer-database-v1','0 16 * * *',$job$select private.matrix_optimizer_http_tick('database');$job$),active:=false);
notify pgrst,'reload schema';
commit;
