-- Atomic, observation-first security subsystem. Deployment SQL; no production writes in development.
begin;
create table private.security_policies (
 category text primary key check(category in ('public_query','admin_login','unauthorized')),
 mode text not null default 'observe' check(mode in ('observe','enforce')),
 threshold integer not null check(threshold between 1 and 100000),
 window_seconds integer not null check(window_seconds between 10 and 3600),
 revision integer not null default 1
);
insert into private.security_policies(category,threshold,window_seconds) values ('public_query',120,60),('admin_login',10,300),('unauthorized',10,300);
create table private.security_identity_secret(secret text not null);
insert into private.security_identity_secret values (gen_random_uuid()::text||gen_random_uuid()::text);
-- Fixed slot count bounds counter/event cardinality independent of attacker identities.
-- Hash collisions share observation counts but never enforce against a different identity.
create table private.security_counters (
 category text not null references private.security_policies(category), slot integer not null check(slot between 0 and 16383),
 source_hash text not null, window_start timestamptz not null, request_count integer not null,
 collided boolean not null default false, denied_count integer not null default 0, updated_at timestamptz not null,
 primary key(category,slot)
);
create table private.security_events (
 category text not null, slot integer not null, group_id uuid not null default gen_random_uuid(),
 source_hash text not null, started_at timestamptz not null, updated_at timestamptz not null,
 event_count integer not null, denied_count integer not null default 0,
 primary key(category,slot)
);
create table private.admin_security_push_jobs (
 id uuid primary key default gen_random_uuid(), group_id uuid not null, category text not null, slot integer not null,
 event_count integer not null, subscription_id uuid not null references public.admin_push_subscriptions(id) on delete cascade,
 admin_id uuid not null references public.admin_accounts(id) on delete cascade,
 status text not null default 'pending' check(status in ('pending','sending','sent','failed','skipped')),
 attempt_count integer not null default 0, next_attempt_at timestamptz not null default now(),
 lease_token uuid,lease_until timestamptz,created_at timestamptz not null default now(),finished_at timestamptz,
 unique(group_id,subscription_id)
);
create index admin_security_push_due on private.admin_security_push_jobs(next_attempt_at) where status in ('pending','sending');
create index admin_security_push_subscription on private.admin_security_push_jobs(subscription_id);
create index admin_security_push_admin on private.admin_security_push_jobs(admin_id);
alter table private.security_policies enable row level security;
alter table private.security_identity_secret enable row level security;
alter table private.security_counters enable row level security;
alter table private.security_events enable row level security;
alter table private.admin_security_push_jobs enable row level security;
revoke all on private.security_policies,private.security_identity_secret,private.security_counters,private.security_events,private.admin_security_push_jobs from public,anon,authenticated,service_role;

create function private.security_collect(p_category text,p_source text,p_trusted boolean,p_outcome text)
returns jsonb language plpgsql security definer set search_path='' set lock_timeout='30ms' as $$
declare
 v_policy private.security_policies%rowtype; v_counter private.security_counters%rowtype; v_event private.security_events%rowtype;
 v_slot integer; v_now timestamptz:=clock_timestamp(); v_window timestamptz; v_exceeded boolean; v_enqueue boolean; v_mode text; v_retry integer;
begin
 if p_category is null or p_source is null or p_source !~ '^[a-f0-9]{64}$' or p_outcome not in ('attempt','denied','invalid','success') then raise exception 'INVALID_SECURITY_EVENT'; end if;
 select * into strict v_policy from private.security_policies where category=p_category;
 v_slot:=(('x'||substr(p_source,1,8))::bit(32)::bigint % 16384)::integer;
 v_window:=to_timestamp(floor(extract(epoch from v_now)/v_policy.window_seconds)*v_policy.window_seconds);
 -- Outcomes do not increment request counts a second time. They still persist denial evidence.
 insert into private.security_counters as c(category,slot,source_hash,window_start,request_count,denied_count,updated_at)
 values(p_category,v_slot,p_source,v_window,case when p_outcome='attempt' then 1 else 0 end,case when p_outcome in ('denied','invalid') then 1 else 0 end,v_now)
 on conflict(category,slot) do update set
 source_hash=case when c.window_start<>v_window then p_source else c.source_hash end,
 collided=case when c.window_start<>v_window then false else c.collided or c.source_hash<>p_source end,
 request_count=least(2147483646,case when c.window_start=v_window then c.request_count else 0 end + case when p_outcome='attempt' then 1 else 0 end),
 denied_count=least(2147483646,case when c.window_start=v_window then c.denied_count else 0 end + case when p_outcome in ('denied','invalid') then 1 else 0 end),
 window_start=v_window,updated_at=v_now returning * into v_counter;
 v_exceeded:=greatest(v_counter.request_count,v_counter.denied_count)>v_policy.threshold;
 v_mode:=case when p_trusted and not v_counter.collided and v_counter.source_hash=p_source then v_policy.mode else 'observe' end;
 v_retry:=greatest(1,ceil(extract(epoch from v_window+make_interval(secs=>v_policy.window_seconds)-v_now))::integer);
 -- Once a suspicious summary exists, include every subsequent attempt, even below
 -- the current rate-window threshold. Outcomes update denial evidence only.
 if v_exceeded or p_outcome in ('denied','invalid')
   or exists(select 1 from private.security_events where category=p_category and slot=v_slot) then
   v_enqueue:=v_exceeded and (v_counter.request_count=v_policy.threshold+1 or v_counter.denied_count=v_policy.threshold+1
     or not exists(select 1 from private.security_events where category=p_category and slot=v_slot and started_at>v_now-interval '15 minutes'));
   insert into private.security_events as e(category,slot,source_hash,started_at,updated_at,event_count,denied_count)
   values(p_category,v_slot,p_source,v_now,v_now,greatest(v_counter.request_count,v_counter.denied_count),v_counter.denied_count)
   on conflict(category,slot) do update set
     -- Roll over on an attempt, so its later outcome cannot create/count a second request.
     group_id=case when p_outcome='attempt' and e.started_at<=v_now-interval '15 minutes' then gen_random_uuid() else e.group_id end,
     source_hash=case when p_outcome='attempt' and e.started_at<=v_now-interval '15 minutes' then p_source else e.source_hash end,
     started_at=case when p_outcome='attempt' and e.started_at<=v_now-interval '15 minutes' then v_now else e.started_at end,
     updated_at=v_now,
     event_count=case when p_outcome='attempt' and e.started_at<=v_now-interval '15 minutes' then 1 else least(2147483646,e.event_count+case when p_outcome='attempt' then 1 else 0 end) end,
     denied_count=case when p_outcome='attempt' and e.started_at<=v_now-interval '15 minutes' then 0 else least(2147483646,e.denied_count+case when p_outcome in ('denied','invalid') then 1 else 0 end) end
   returning * into v_event;
   if v_enqueue then
     -- Nonblocking global admission lock bounds total jobs to 10,000. Drop alerts, never queries, under pressure.
     if pg_try_advisory_xact_lock(683721091) then
       insert into private.admin_security_push_jobs(group_id,category,slot,event_count,subscription_id,admin_id)
       select v_event.group_id,p_category,v_slot,v_event.event_count,s.id,s.admin_id
       from public.admin_push_subscriptions s join public.admin_accounts a on a.id=s.admin_id
       where s.enabled and a.role='超級管理員' and a.status='啟用'
       order by s.id limit greatest(0,10000-(select count(*)::integer from private.admin_security_push_jobs))
       on conflict(group_id,subscription_id) do nothing;
     end if;
   end if;
 end if;
 return jsonb_build_object('allowed',not(v_exceeded and v_mode='enforce'),'retryAfter',v_retry,'mode',v_mode);
end;$$;
revoke all on function private.security_collect(text,text,boolean,text) from public,anon,authenticated,service_role;

create function public.security_observe(p_category text,p_source text,p_trusted boolean default false,p_outcome text default 'attempt')
returns jsonb language plpgsql security definer set search_path='' set lock_timeout='30ms' as $$
begin
 return private.security_collect(p_category,p_source,p_trusted,p_outcome);
exception when others then
 return jsonb_build_object('allowed',true,'retryAfter',0,'mode','observe','degraded',true);
end;$$;
revoke all on function public.security_observe(text,text,boolean,text) from public,anon,authenticated;
grant execute on function public.security_observe(text,text,boolean,text) to service_role;

create table private.security_policy_audit (
 id uuid primary key default gen_random_uuid(), admin_id uuid not null, category text not null,
 previous_value jsonb not null, next_value jsonb not null, created_at timestamptz not null default now()
);
alter table private.security_policy_audit enable row level security;
revoke all on private.security_policy_audit from public,anon,authenticated,service_role;
create function public.security_policy_update(p_admin_id uuid,p_category text,p_mode text,p_threshold integer,p_window_seconds integer,p_expected_revision integer)
returns jsonb language plpgsql security definer set search_path='' set lock_timeout='100ms' as $$
declare v_before private.security_policies%rowtype;v_after private.security_policies%rowtype;
begin
 if not exists(select 1 from public.admin_accounts where id=p_admin_id and role='超級管理員' and status='啟用') then raise exception using errcode='42501',message='FORBIDDEN'; end if;
 select * into strict v_before from private.security_policies where category=p_category for update;
 if p_expected_revision is null or v_before.revision<>p_expected_revision then raise exception using errcode='40001',message='SECURITY_POLICY_REVISION_CONFLICT'; end if;
 update private.security_policies set mode=p_mode,threshold=p_threshold,window_seconds=p_window_seconds,revision=revision+1 where category=p_category returning * into v_after;
 insert into private.security_policy_audit(admin_id,category,previous_value,next_value) values(p_admin_id,p_category,to_jsonb(v_before),to_jsonb(v_after));
 return to_jsonb(v_after);
end;$$;
create function public.security_policy_list(p_admin_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.admin_accounts where id=p_admin_id and role='超級管理員' and status='啟用') then raise exception using errcode='42501',message='FORBIDDEN'; end if;
 return (select jsonb_agg(to_jsonb(p) order by category) from private.security_policies p);
end;$$;
revoke all on function public.security_policy_update(uuid,text,text,integer,integer,integer),public.security_policy_list(uuid) from public,anon,authenticated;
grant execute on function public.security_policy_update(uuid,text,text,integer,integer,integer),public.security_policy_list(uuid) to service_role;

-- Preconditions verify the six audited ACLs and original volatility before moving definitions unchanged.
do $$declare f text; op text; n text; p pg_proc%rowtype; begin
 foreach f in array array['explore','tianyan','tiangong'] loop foreach op in array array['list','validation'] loop
 n:='matrix_'||f||'_'||op;
 select * into strict p from pg_proc where oid=to_regprocedure('public.'||n||'(jsonb)');
 if exists(select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl where acl.grantee=0 or pg_get_userbyid(acl.grantee) not in ('postgres','anon','authenticated','service_role') or (acl.is_grantable and acl.grantee<>p.proowner)) then raise exception 'SECURITY_WRAPPER_UNEXPECTED_ACL: %',n; end if;
 if p.provolatile<>'s' or not p.prosecdef or p.prorettype<>'jsonb'::regtype or to_regprocedure('private.'||n||'_impl(jsonb)') is not null then raise exception 'SECURITY_WRAPPER_PRECONDITION: %',n; end if;
 if has_function_privilege('anon',p.oid,'execute')<>(f='explore') or not has_function_privilege('authenticated',p.oid,'execute') or not has_function_privilege('service_role',p.oid,'execute') then raise exception 'SECURITY_WRAPPER_ACL_CHANGED: %',n; end if;
 execute format('alter function public.%I(jsonb) set schema private',n);
 execute format('alter function private.%I(jsonb) rename to %I',n,n||'_impl');
 execute format('revoke all on function private.%I(jsonb) from public,anon,authenticated',n||'_impl');
 end loop;end loop;end$$;

create function private.matrix_request_guard(p_operation text,p_request jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_method text:=nullif(current_setting('request.method',true),''); v_uid text; v_source text; v_guard jsonb; v_result jsonb;
 v_code text;v_message text;v_detail text;v_hint text; v_status text;
begin
 if v_method is not null and v_method<>'POST' then raise exception using errcode='25006',message='POST_REQUIRED'; end if;
 if v_method='POST' then
   if coalesce(nullif(current_setting('request.headers',true),'')::jsonb->>'prefer','') ~* '(^|,)\s*tx\s*=\s*rollback\s*(,|$)' then raise exception using errcode='22023',message='TRANSACTION_ROLLBACK_NOT_SUPPORTED'; end if;
   begin
    v_uid:=auth.uid()::text;
    select encode(sha256(convert_to(secret||coalesce(v_uid,'unattributed'),'UTF8')),'hex') into v_source from private.security_identity_secret;
    v_guard:=private.security_collect('public_query',v_source,v_uid is not null,'attempt');
   exception when others then v_guard:=null; end;
   if v_guard->>'allowed'='false' then
     perform set_config('response.status','429',true);
     perform set_config('response.headers',jsonb_build_array(jsonb_build_object('Retry-After',v_guard->>'retryAfter'))::text,true);
     return jsonb_build_object('code','RATE_LIMITED','message','Too many requests','details',null,'hint',null);
   end if;
 end if;
 begin
   case p_operation
    when 'explore_list' then v_result:=private.matrix_explore_list_impl(p_request);
    when 'explore_validation' then v_result:=private.matrix_explore_validation_impl(p_request);
    when 'tianyan_list' then v_result:=private.matrix_tianyan_list_impl(p_request);
    when 'tianyan_validation' then v_result:=private.matrix_tianyan_validation_impl(p_request);
    when 'tiangong_list' then v_result:=private.matrix_tiangong_list_impl(p_request);
    when 'tiangong_validation' then v_result:=private.matrix_tiangong_validation_impl(p_request);
    else raise exception 'INVALID_OPERATION';
   end case;
 exception when others then
   get stacked diagnostics v_code=returned_sqlstate,v_message=message_text,v_detail=pg_exception_detail,v_hint=pg_exception_hint;
   if v_method is null or not(v_code in ('42501','22023','22P02','22007','22008') or (v_code='P0001' and v_message in ('ANALYSIS_NOT_FOUND','ANALYSIS_NOT_READY','ANALYSIS_VERSION_MISMATCH','ANALYSIS_STALE','INVALID_REQUEST','FORBIDDEN'))) then raise; end if;
 end;
 if v_code is not null then
   if v_code<>'P0001' then
     begin perform private.security_collect('public_query',v_source,v_uid is not null,case when v_code='42501' then 'denied' else 'invalid' end); exception when others then null; end;
   end if;
   v_status:=case when v_code='42501' then case when coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role','anon')='anon' then '401' else '403' end else '400' end;
   perform set_config('response.status',v_status,true);
   return jsonb_build_object('code',v_code,'message',v_message,'details',nullif(v_detail,''),'hint',nullif(v_hint,''));
 end if;
 return v_result;
end;$$;
revoke all on function private.matrix_request_guard(text,jsonb) from public,anon,authenticated,service_role;

do $$declare f text;op text;n text;v_owner text;begin
 foreach f in array array['explore','tianyan','tiangong'] loop foreach op in array array['list','validation'] loop
 n:='matrix_'||f||'_'||op;
 select pg_get_userbyid(proowner) into v_owner from pg_proc where oid=to_regprocedure('private.'||n||'_impl(jsonb)');
 execute format('create function public.%I(p_request jsonb) returns jsonb language sql volatile security definer set search_path='''' as %L',n,'select private.matrix_request_guard('||quote_literal(f||'_'||op)||',p_request)');
 execute format('alter function public.%I(jsonb) owner to %I',n,v_owner);
 execute format('revoke all on function public.%I(jsonb) from public,anon,authenticated,service_role',n);
 execute format('grant execute on function public.%I(jsonb) to authenticated,service_role',n);
 if f='explore' then execute format('grant execute on function public.%I(jsonb) to anon',n); end if;
 end loop;end loop;
end$$;

create function public.admin_security_push_eligible(p_id uuid,p_lease_token uuid) returns boolean
language sql security definer set search_path='' as $$
 select exists(select 1 from private.admin_security_push_jobs j
 join public.admin_push_subscriptions s on s.id=j.subscription_id and s.admin_id=j.admin_id
 join public.admin_accounts a on a.id=j.admin_id
 where j.id=p_id and j.lease_token=p_lease_token and j.status='sending' and j.lease_until>now()
 and s.enabled and a.role='超級管理員' and a.status='啟用' and s.updated_at<=j.created_at);
$$;
create function public.admin_security_push_claim()
returns table(id uuid,lease_token uuid,subscription_id uuid,admin_id uuid,group_id uuid,category text,event_count integer,endpoint text,p256dh text,auth_key text)
language plpgsql security definer set search_path='' set lock_timeout='100ms' as $$
begin
 update private.admin_security_push_jobs j set status='failed',finished_at=now()
 where j.id in(select x.id from private.admin_security_push_jobs x where x.status in ('pending','sending') and x.attempt_count>=5 and (x.status='pending' or x.lease_until<=now()) limit 100 for update skip locked);
 return query with candidates as (
 select j.id from private.admin_security_push_jobs j where j.attempt_count<5 and ((j.status='pending' and j.next_attempt_at<=now()) or (j.status='sending' and j.lease_until<=now())) order by j.next_attempt_at,j.id limit 10 for update skip locked
 ), claimed as (
 update private.admin_security_push_jobs j set status='sending',attempt_count=j.attempt_count+1,lease_token=gen_random_uuid(),lease_until=now()+interval '2 minutes'
 from candidates c where j.id=c.id returning j.*)
 select j.id,j.lease_token,j.subscription_id,j.admin_id,j.group_id,j.category,greatest(j.event_count,coalesce(e.event_count,0)),s.endpoint,s.p256dh,s.auth_key
 from claimed j join public.admin_push_subscriptions s on s.id=j.subscription_id
 left join private.security_events e on e.category=j.category and e.slot=j.slot and e.group_id=j.group_id;
end;$$;
create function public.admin_security_push_finish(p_id uuid,p_lease_token uuid,p_outcome text,p_disable boolean default false)
returns boolean language plpgsql security definer set search_path='' set lock_timeout='100ms' as $$
declare v_job private.admin_security_push_jobs%rowtype;
begin
 if p_outcome is null or p_outcome not in ('sent','retry','failed','skipped') then raise exception 'INVALID_OUTCOME'; end if;
 select * into v_job from private.admin_security_push_jobs j where j.id=p_id and j.lease_token=p_lease_token and j.status='sending' and j.lease_until>now() for update;
 if not found then return false; end if;
 if p_disable then update public.admin_push_subscriptions s set enabled=false,updated_at=now() where s.id=v_job.subscription_id and s.admin_id=v_job.admin_id and s.updated_at<=v_job.created_at; end if;
 update private.admin_security_push_jobs j set
 status=case when p_outcome='retry' and j.attempt_count<5 then 'pending' when p_outcome='retry' then 'failed' else p_outcome end,
 next_attempt_at=now()+make_interval(mins=>power(2,j.attempt_count-1)::integer),
 finished_at=case when p_outcome='retry' and j.attempt_count<5 then null else now() end,lease_token=null,lease_until=null where j.id=p_id;
 return true;
end;$$;
revoke all on function public.admin_security_push_claim(),public.admin_security_push_eligible(uuid,uuid),public.admin_security_push_finish(uuid,uuid,text,boolean) from public,anon,authenticated;
grant execute on function public.admin_security_push_claim(),public.admin_security_push_eligible(uuid,uuid),public.admin_security_push_finish(uuid,uuid,text,boolean) to service_role;

create function private.security_cleanup() returns void language plpgsql security definer set search_path='' set lock_timeout='100ms' as $$
begin
 delete from private.admin_security_push_jobs where id in(select id from private.admin_security_push_jobs where created_at<now()-interval '7 days' and (status<>'sending' or lease_until<now()) limit 1000 for update skip locked);
 delete from private.security_policy_audit where id in(select id from private.security_policy_audit where created_at<now()-interval '7 days' limit 1000 for update skip locked);
 delete from private.security_events where (category,slot) in(select category,slot from private.security_events where updated_at<now()-interval '7 days' limit 1000 for update skip locked);
 delete from private.security_counters where (category,slot) in(select category,slot from private.security_counters where updated_at<now()-interval '7 days' limit 1000 for update skip locked);
end;$$;
revoke all on function private.security_cleanup() from public,anon,authenticated,service_role;

-- Deployment scheduler is separate so local PostgreSQL tests do not require network extensions.
commit;
