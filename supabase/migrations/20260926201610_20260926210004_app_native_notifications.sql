-- App transport consumes immutable event snapshots and owns its delivery queue.
create table private.app_native_push_devices (like private.native_push_devices including all);
alter table private.app_native_push_devices add foreign key(member_id) references public.app_members(id) on delete cascade;
create table private.app_native_push_deliveries (like private.native_push_deliveries including all);
alter table private.app_native_push_deliveries add foreign key(installation_id) references private.app_native_push_devices(installation_id) on delete cascade;
create table private.app_native_push_events (
 id uuid primary key default gen_random_uuid(), event_key text not null unique,event_type text not null,payload jsonb not null,
 created_at timestamptz not null default now(),processed_at timestamptz,attempt_count integer not null default 0,
 available_at timestamptz not null default now(),last_error_code text
);
create index app_native_events_due on private.app_native_push_events(available_at,created_at) where processed_at is null;
create table private.app_native_push_outbox (
 id uuid primary key default gen_random_uuid(),event_id uuid not null references private.app_native_push_events(id) on delete cascade,
 member_id uuid not null references public.app_members(id) on delete cascade,notification_payload jsonb not null,
 created_at timestamptz not null default now(),unique(event_id,member_id)
);
create table private.app_native_legacy_receipts (
 event_id uuid not null,installation_id uuid not null,legacy_delivery_id uuid not null,outcome text,created_at timestamptz not null default now(),
 primary key(event_id,installation_id)
);
create table private.app_native_installation_upgrades (
 installation_id uuid primary key,auth_user_id uuid not null references auth.users(id) on delete cascade,upgraded_at timestamptz not null default now()
);
alter table private.app_native_push_devices enable row level security;
alter table private.app_native_push_deliveries enable row level security;
alter table private.app_native_push_events enable row level security;
alter table private.app_native_push_outbox enable row level security;
alter table private.app_native_legacy_receipts enable row level security;
alter table private.app_native_installation_upgrades enable row level security;
revoke all on private.app_native_push_devices,private.app_native_push_deliveries,private.app_native_push_events,
 private.app_native_push_outbox,private.app_native_legacy_receipts,private.app_native_installation_upgrades from public,anon,authenticated,service_role;

create or replace function private.app_notification_member_matches(
  p_member_id uuid,
  p_event_type text,
  p_payload jsonb
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_settings jsonb;
  v_member_status text;
  v_enabled boolean;
  v_options jsonb := '[]'::jsonb;
  v_value text;
begin
  select
    coalesce(setting.settings, private.default_app_notification_settings()),
    member.status
  into v_settings, v_member_status
  from public.app_members as member
  left join public.app_notification_settings as setting
    on setting.member_id = member.id
  where member.id = p_member_id
  limit 1;

  if not found
    or coalesce(v_member_status, '') in ('停用', 'disabled', 'inactive') then
    return false;
  end if;

  if pg_catalog.jsonb_typeof(v_settings) <> 'object'
    or pg_catalog.jsonb_typeof(v_settings->'settings') <> 'object'
    or pg_catalog.jsonb_typeof(v_settings->'selectedOptions') <> 'object' then
    return false;
  end if;

  if p_event_type = 'lottery_result' then
    v_enabled := case
      when pg_catalog.jsonb_typeof(v_settings->'settings'->'result') = 'boolean'
        then (v_settings->'settings'->>'result')::boolean
      else false
    end;
    v_options := case
      when pg_catalog.jsonb_typeof(v_settings->'selectedOptions'->'result') = 'array'
        then v_settings->'selectedOptions'->'result'
      else '[]'::jsonb
    end;
    v_value := p_payload->>'lottery';
  elsif p_event_type = 'matrix_status' then
    v_enabled := case
      when pg_catalog.jsonb_typeof(v_settings->'settings'->'status') = 'boolean'
        then (v_settings->'settings'->>'status')::boolean
      else false
    end;
    if not v_enabled then
      return false;
    end if;

    v_options := case
      when pg_catalog.jsonb_typeof(v_settings->'selectedOptions'->'status') = 'array'
        then v_settings->'selectedOptions'->'status'
      else '[]'::jsonb
    end;
    if not exists (
      select 1
      from pg_catalog.jsonb_array_elements_text(v_options) as option(value)
      where option.value = p_payload->>'lottery'
    ) then
      return false;
    end if;

    v_options := case
      when pg_catalog.jsonb_typeof(v_settings->'statusOptions') = 'object'
        and pg_catalog.jsonb_typeof(v_settings->'statusOptions'->(p_payload->>'lottery')) = 'array'
        then v_settings->'statusOptions'->(p_payload->>'lottery')
      else '[]'::jsonb
    end;
    v_value := p_payload->>'statusLabel';
  elsif p_event_type = 'matrix_card' then
    v_enabled := case
      when pg_catalog.jsonb_typeof(v_settings->'settings'->'card') = 'boolean'
        then (v_settings->'settings'->>'card')::boolean
      else false
    end;
    v_options := case
      when pg_catalog.jsonb_typeof(v_settings->'selectedOptions'->'card') = 'array'
        then v_settings->'selectedOptions'->'card'
      else '[]'::jsonb
    end;
    v_value := p_payload->>'lottery';
  elsif p_event_type = 'system_notice' then
    v_enabled := case
      when pg_catalog.jsonb_typeof(v_settings->'settings'->'system') = 'boolean'
        then (v_settings->'settings'->>'system')::boolean
      else false
    end;
    v_options := case
      when pg_catalog.jsonb_typeof(v_settings->'selectedOptions'->'system') = 'array'
        then v_settings->'selectedOptions'->'system'
      else '[]'::jsonb
    end;
    v_value := p_payload->>'category';
  elsif p_event_type = 'bet_reminder' then
    v_enabled := case
      when pg_catalog.jsonb_typeof(v_settings->'settings'->'bet') = 'boolean'
        then (v_settings->'settings'->>'bet')::boolean
      else false
    end;
    -- Both web fanout and native_push_eligible use this existing guard.
    -- Use the statement's delivery time, including for native retry recovery.
    return coalesce(v_enabled
      and p_payload->>'memberId' = p_member_id::text
      and private.notification_reminder_is_due(p_payload, pg_catalog.statement_timestamp()), false);
  elsif p_event_type = 'membership_expiry' then
    v_enabled := case
      when pg_catalog.jsonb_typeof(v_settings->'settings'->'expiry') = 'boolean'
        then (v_settings->'settings'->>'expiry')::boolean
      else false
    end;
    if not (
      v_enabled
      and p_payload->>'memberId' = p_member_id::text
    ) then
      return false;
    end if;
    v_options := case
      when pg_catalog.jsonb_typeof(v_settings->'selectedOptions'->'expiry') = 'array'
        then v_settings->'selectedOptions'->'expiry'
      else '[]'::jsonb
    end;
    v_value := '提前' || coalesce(p_payload->>'daysBefore', '') || '日';
  else
    return false;
  end if;

  if not coalesce(v_enabled, false) or v_value is null then
    return false;
  end if;

  return exists (
    select 1
    from pg_catalog.jsonb_array_elements_text(v_options) as option(value)
    where option.value = v_value
  );
exception
  when data_exception then
    return false;
end;
$$;

create function private.app_notification_fanout(p_limit integer default 100)
returns void language plpgsql security definer set search_path='' as $$
declare e private.app_native_push_events%rowtype;
begin
 for e in select * from private.app_native_push_events where processed_at is null and attempt_count<5 and available_at<=now()
   order by created_at,id limit greatest(1,least(coalesce(p_limit,100),100)) for update skip locked loop
  begin
   insert into private.app_native_push_outbox(event_id,member_id,notification_payload,created_at)
   select distinct e.id,d.member_id,private.notification_render_payload(e.event_type,e.event_key,e.payload),e.created_at
   from private.app_native_push_devices d
   where d.enabled and d.enabled_at<=e.created_at and private.native_push_session_valid(d.auth_user_id,d.session_id)
     and private.app_notification_member_matches(d.member_id,e.event_type,e.payload)
   on conflict(event_id,member_id) do nothing;
   update private.app_native_push_events set processed_at=now(),last_error_code=null where id=e.id;
  exception when others then
   update private.app_native_push_events set attempt_count=attempt_count+1,available_at=now()+interval '5 minutes',last_error_code=sqlstate where id=e.id;
  end;
 end loop;
end;
$$;

create function private.app_notification_capture()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 -- Personal expiry/reminder and PWA marketing notices are not App broadcasts.
 if new.event_type in ('lottery_result','matrix_status','matrix_card') then
  insert into private.app_native_push_events(id,event_key,event_type,payload,created_at)
    values(new.id,new.event_key,new.event_type,new.payload,new.created_at) on conflict do nothing;
 end if;
 return null;
end;
$$;
create trigger app_notification_capture after insert on public.notification_events for each row execute function private.app_notification_capture();

create function public.app_native_push_save(p_installation_id uuid,p_token text,p_platform text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_session uuid := private.product_session_id();
  v_member uuid := private.active_app_member_id(); v_old private.app_native_push_devices%rowtype;
begin
  if p_installation_id is null or p_platform is distinct from 'android' or p_token is null
    or length(p_token) not between 20 and 4096 or p_token ~ '[[:space:]]' then
    raise exception using errcode='22023',message='INVALID_NATIVE_PUSH_REGISTRATION';
  end if;
  -- Serialize native registration mutations only, including token transfers across installations.
  perform pg_catalog.pg_advisory_xact_lock(740921663);
  if exists(select 1 from private.native_push_devices d where d.enabled and d.auth_user_id<>auth.uid()
    and (d.installation_id=p_installation_id or d.token=p_token) and private.native_push_session_valid(d.auth_user_id,d.session_id)) then
    raise exception using errcode='42501',message='TOKEN_IN_USE';
  end if;
  if exists(select 1 from private.native_push_devices d where d.enabled and d.token=p_token and d.installation_id<>p_installation_id) then
    raise exception using errcode='42501',message='TOKEN_IN_USE';
  end if;
  -- Reserve every possibly sent legacy event before disabling its device. An
  -- in-flight sender retains its lease and must finalize against that receipt.
  insert into private.app_native_legacy_receipts(event_id,installation_id,legacy_delivery_id,outcome)
  select o.event_id,q.installation_id,q.id,case when q.status='sent' then 'sent' end
  from private.native_push_deliveries q join public.notification_outbox o on o.id=q.outbox_id
  where q.installation_id=p_installation_id and (q.attempt_count>0 or q.status in ('processing','sent'))
  on conflict(event_id,installation_id) do nothing;
  update private.native_push_deliveries set status='canceled',finished_at=now()
    where installation_id=p_installation_id and status='pending';
  update private.native_push_devices set enabled=false,disabled_reason='superseded',revision=gen_random_uuid(),updated_at=now()
    where installation_id=p_installation_id and enabled;
  insert into private.app_native_installation_upgrades(installation_id,auth_user_id) values(p_installation_id,auth.uid())
    on conflict(installation_id) do update set auth_user_id=excluded.auth_user_id;

  select * into v_old from private.app_native_push_devices where installation_id=p_installation_id for update;
  if found and v_old.auth_user_id<>auth.uid() and v_old.enabled
    and private.native_push_session_valid(v_old.auth_user_id,v_old.session_id) then
    raise exception using errcode='42501',message='INSTALLATION_IN_USE';
  end if;
  if exists(select 1 from private.app_native_push_devices d where d.token=p_token and d.enabled
    and d.auth_user_id<>auth.uid() and private.native_push_session_valid(d.auth_user_id,d.session_id)) then
    raise exception using errcode='42501',message='TOKEN_IN_USE';
  end if;
  update private.app_native_push_devices set enabled=false,disabled_reason='superseded',revision=gen_random_uuid(),updated_at=now()
    where token=p_token and enabled and installation_id<>p_installation_id;
  insert into private.app_native_push_devices(installation_id,auth_user_id,member_id,session_id,token,platform)
    values(p_installation_id,auth.uid(),v_member,v_session,p_token,p_platform)
  on conflict(installation_id) do update set
    auth_user_id=excluded.auth_user_id,member_id=excluded.member_id,session_id=excluded.session_id,
    token=excluded.token,platform=excluded.platform,enabled=true,disabled_reason=null,updated_at=now(),
    enabled_at=case when app_native_push_devices.enabled and app_native_push_devices.auth_user_id=excluded.auth_user_id
      and app_native_push_devices.session_id=excluded.session_id then app_native_push_devices.enabled_at else now() end,
    revision=case when app_native_push_devices.enabled and app_native_push_devices.auth_user_id=excluded.auth_user_id
      and app_native_push_devices.session_id=excluded.session_id and app_native_push_devices.token=excluded.token
      then app_native_push_devices.revision else gen_random_uuid() end;
  -- Keep unsent work on a refresh for this same binding. Retain active leases:
  -- an old worker may already be sending. claim_revision preserves which token
  -- it actually used. A different login/account never inherits work.
  if v_old.enabled and v_old.auth_user_id=auth.uid() and v_old.member_id=v_member
    and v_old.session_id=v_session and v_old.token<>p_token then
    update private.app_native_push_deliveries q set
      device_revision=d.revision,
      next_attempt_at=now()
    from private.app_native_push_devices d
    where d.installation_id=p_installation_id and q.installation_id=p_installation_id
      and q.device_revision=v_old.revision and q.status in ('pending','processing');
  end if;
  return jsonb_build_object('enabled',true);
end;
$$;

create function public.app_native_push_status(p_installation_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_session uuid; v_member uuid;
begin
  begin v_session:=private.product_session_id(); v_member:=private.active_app_member_id();
  exception when insufficient_privilege then return jsonb_build_object('enabled',false,'refreshable',false); end;
  return jsonb_build_object('enabled',exists(select 1 from private.app_native_push_devices d
    where d.installation_id=p_installation_id and d.auth_user_id=auth.uid() and d.member_id=v_member
    and d.session_id=v_session and d.enabled),
    'refreshable',exists(select 1 from private.app_native_push_devices d
    where d.installation_id=p_installation_id and d.auth_user_id=auth.uid() and d.member_id=v_member
    and d.session_id=v_session and not d.enabled and d.disabled_reason='unregistered'));
end;
$$;

create function public.app_native_push_disable(p_installation_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_session uuid:=private.product_session_id(); v_member uuid:=private.active_app_member_id(); v_count integer;
begin
  update private.app_native_push_devices set enabled=false,disabled_reason='user',revision=gen_random_uuid(),updated_at=now()
  where installation_id=p_installation_id and auth_user_id=auth.uid() and member_id=v_member and session_id=v_session;
  get diagnostics v_count=row_count;
  return jsonb_build_object('disabled',v_count>0);
end;
$$;

create function private.app_native_push_eligible(p_installation uuid,p_revision uuid,p_outbox uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from private.app_native_push_devices d
    join public.app_members m on m.id=d.member_id and m.auth_user_id=d.auth_user_id
    join private.app_native_push_outbox o on o.id=p_outbox and o.member_id=d.member_id
    join private.app_native_push_events e on e.id=o.event_id
    where d.installation_id=p_installation and d.revision=p_revision and d.enabled
      and o.created_at>=d.enabled_at and coalesce(m.status,'') not in ('停用','disabled','inactive')
      and private.native_push_session_valid(d.auth_user_id,d.session_id)
      and not exists(select 1 from private.app_native_legacy_receipts r where r.event_id=e.id and r.installation_id=d.installation_id)
      and private.app_notification_member_matches(d.member_id,e.event_type,e.payload));
$$;

create function public.app_native_notification_claim(p_limit integer default 20)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_result jsonb;
begin
  perform private.app_notification_fanout(100);
  insert into private.app_native_push_deliveries(outbox_id,installation_id,device_revision)
  select o.id,d.installation_id,d.revision from private.app_native_push_devices d
    join private.app_native_push_outbox o on o.member_id=d.member_id and o.created_at>=d.enabled_at
    where d.enabled and private.app_native_push_eligible(d.installation_id,d.revision,o.id)
      and not exists(select 1 from private.app_native_push_deliveries q where q.outbox_id=o.id and q.installation_id=d.installation_id)
    order by o.created_at,o.id,d.installation_id limit 1000
    on conflict(outbox_id,installation_id) do nothing;
  update private.app_native_push_deliveries set status='failed',finished_at=now(),claim_id=null,lease_until=null
    where status='processing' and lease_until<=now() and attempt_count>=5;
  with candidates as (
    select q.id from private.app_native_push_deliveries q
    where ((q.status='pending' and q.next_attempt_at<=now()) or (q.status='processing' and q.lease_until<=now()))
      and q.attempt_count<5 order by q.created_at,q.id
      limit greatest(1,least(coalesce(p_limit,20),20)) for update skip locked
  ), claimed as (
    update private.app_native_push_deliveries q set status='processing',attempt_count=q.attempt_count+1,
      claim_id=gen_random_uuid(),claim_revision=q.device_revision,lease_until=now()+interval '2 minutes'
    from candidates c where q.id=c.id returning q.id,q.claim_id
  ) select coalesce(jsonb_agg(jsonb_build_object('delivery_id',id,'claim_id',claim_id)),'[]'::jsonb) into v_result from claimed;
  return v_result;
end;
$$;

create function public.app_native_notification_prepare(p_delivery_id uuid,p_claim_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_q private.app_native_push_deliveries%rowtype; v_result jsonb;
begin
  select * into v_q from private.app_native_push_deliveries where id=p_delivery_id and claim_id=p_claim_id
    and status='processing' and lease_until>now() for update;
  if not found then return null; end if;
  -- Rotation retains this lease for an old in-flight sender. It must not start
  -- another send using a token different from the one recorded on its claim.
  if v_q.claim_revision<>v_q.device_revision then return null; end if;
  if not private.app_native_push_eligible(v_q.installation_id,v_q.device_revision,v_q.outbox_id) then
    update private.app_native_push_deliveries set status='canceled',finished_at=now(),claim_id=null,lease_until=null where id=v_q.id;
    return null;
  end if;
  select jsonb_build_object('token',d.token,'outbox_id',o.id,'notification_payload',o.notification_payload)
    into v_result from private.app_native_push_devices d join private.app_native_push_outbox o on o.id=v_q.outbox_id
    where d.installation_id=v_q.installation_id and d.revision=v_q.device_revision;
  return v_result;
end;
$$;

create function public.app_native_notification_finalize(p_delivery_id uuid,p_claim_id uuid,p_outcome text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_q private.app_native_push_deliveries%rowtype;
begin
  -- Match registration's lock order before touching queue then device rows.
  perform pg_catalog.pg_advisory_xact_lock(740921663);
  if p_outcome is null or p_outcome not in ('sent','retry','failed','unregistered') then
    raise exception using errcode='22023',message='INVALID_NATIVE_PUSH_OUTCOME';
  end if;
  select * into v_q from private.app_native_push_deliveries where id=p_delivery_id and claim_id=p_claim_id
    and status='processing' and lease_until>now() for update;
  if not found then return jsonb_build_object('finalized',false); end if;
  if not exists(select 1 from private.app_native_push_devices where installation_id=v_q.installation_id and revision=v_q.device_revision and enabled) then
    update private.app_native_push_deliveries set status='canceled',finished_at=now(),claim_id=null,lease_until=null where id=v_q.id;
    return jsonb_build_object('finalized',false);
  end if;
  if v_q.claim_revision<>v_q.device_revision and p_outcome<>'sent' then
    -- A negative result about an old token says nothing about the replacement.
    update private.app_native_push_deliveries set
      status=case when attempt_count<5 then 'pending' else 'failed' end,
      next_attempt_at=now(),claim_id=null,lease_until=null,
      finished_at=case when attempt_count<5 then null else now() end where id=v_q.id;
    return jsonb_build_object('finalized',false);
  end if;
  if p_outcome='unregistered' then
    update private.app_native_push_devices set enabled=false,disabled_reason='unregistered',revision=gen_random_uuid(),updated_at=now()
    where installation_id=v_q.installation_id and revision=v_q.device_revision;
  end if;
  update private.app_native_push_deliveries set
    status=case when p_outcome='sent' then 'sent' when p_outcome='retry' and attempt_count<5 then 'pending' else 'failed' end,
    next_attempt_at=now()+make_interval(secs=>least(3600,60*(2^attempt_count)::integer)),
    finished_at=case when p_outcome='retry' and attempt_count<5 then null else now() end,
    claim_id=null,lease_until=null where id=v_q.id;
  return jsonb_build_object('finalized',true);
end;
$$;

create or replace function public.member_native_push_save(p_installation_id uuid,p_token text,p_platform text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_session uuid := private.native_push_current_session();
  v_member uuid := private.active_member_id(); v_old private.native_push_devices%rowtype;
begin
  if p_installation_id is null or p_platform is distinct from 'android' or p_token is null
    or length(p_token) not between 20 and 4096 or p_token ~ '[[:space:]]' then
    raise exception using errcode='22023',message='INVALID_NATIVE_PUSH_REGISTRATION';
  end if;
  -- Serialize native registration mutations only, including token transfers across installations.
  perform pg_catalog.pg_advisory_xact_lock(740921663);
  if exists(select 1 from private.app_native_installation_upgrades where installation_id=p_installation_id) then
    raise exception using errcode='42501',message='APP_UPGRADE_REQUIRED';
  end if;
  if exists(select 1 from private.app_native_push_devices where enabled and token=p_token) then
    raise exception using errcode='42501',message='TOKEN_IN_USE';
  end if;
  select * into v_old from private.native_push_devices where installation_id=p_installation_id for update;
  if found and v_old.auth_user_id<>auth.uid() and v_old.enabled
    and private.native_push_session_valid(v_old.auth_user_id,v_old.session_id) then
    raise exception using errcode='42501',message='INSTALLATION_IN_USE';
  end if;
  if exists(select 1 from private.native_push_devices d where d.token=p_token and d.enabled
    and d.auth_user_id<>auth.uid() and private.native_push_session_valid(d.auth_user_id,d.session_id)) then
    raise exception using errcode='42501',message='TOKEN_IN_USE';
  end if;
  update private.native_push_devices set enabled=false,disabled_reason='superseded',revision=gen_random_uuid(),updated_at=now()
    where token=p_token and enabled and installation_id<>p_installation_id;
  insert into private.native_push_devices(installation_id,auth_user_id,member_id,session_id,token,platform)
    values(p_installation_id,auth.uid(),v_member,v_session,p_token,p_platform)
  on conflict(installation_id) do update set
    auth_user_id=excluded.auth_user_id,member_id=excluded.member_id,session_id=excluded.session_id,
    token=excluded.token,platform=excluded.platform,enabled=true,disabled_reason=null,updated_at=now(),
    enabled_at=case when native_push_devices.enabled and native_push_devices.auth_user_id=excluded.auth_user_id
      and native_push_devices.session_id=excluded.session_id then native_push_devices.enabled_at else now() end,
    revision=case when native_push_devices.enabled and native_push_devices.auth_user_id=excluded.auth_user_id
      and native_push_devices.session_id=excluded.session_id and native_push_devices.token=excluded.token
      then native_push_devices.revision else gen_random_uuid() end;
  -- Keep unsent work on a refresh for this same binding. Retain active leases:
  -- an old worker may already be sending. claim_revision preserves which token
  -- it actually used. A different login/account never inherits work.
  if v_old.enabled and v_old.auth_user_id=auth.uid() and v_old.member_id=v_member
    and v_old.session_id=v_session and v_old.token<>p_token then
    update private.native_push_deliveries q set
      device_revision=d.revision,
      next_attempt_at=now()
    from private.native_push_devices d
    where d.installation_id=p_installation_id and q.installation_id=p_installation_id
      and q.device_revision=v_old.revision and q.status in ('pending','processing');
  end if;
  return jsonb_build_object('enabled',true);
end;
$$;

create or replace function public.native_notification_finalize(p_delivery_id uuid,p_claim_id uuid,p_outcome text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_q private.native_push_deliveries%rowtype;
begin
  -- Match registration's lock order before touching queue then device rows.
  perform pg_catalog.pg_advisory_xact_lock(740921663);
  if p_outcome is null or p_outcome not in ('sent','retry','failed','unregistered') then
    raise exception using errcode='22023',message='INVALID_NATIVE_PUSH_OUTCOME';
  end if;
  select * into v_q from private.native_push_deliveries where id=p_delivery_id and claim_id=p_claim_id
    and status='processing' and lease_until>now() for update;
  if not found then return jsonb_build_object('finalized',false); end if;
  if exists(select 1 from private.app_native_legacy_receipts where legacy_delivery_id=v_q.id) then
    update private.app_native_legacy_receipts set outcome=p_outcome where legacy_delivery_id=v_q.id;
    update private.native_push_deliveries set status=case when p_outcome='sent' then 'sent' else 'canceled' end,
      finished_at=now(),claim_id=null,lease_until=null where id=v_q.id;
    return jsonb_build_object('finalized',true);
  end if;
  if not exists(select 1 from private.native_push_devices where installation_id=v_q.installation_id and revision=v_q.device_revision and enabled) then
    update private.native_push_deliveries set status='canceled',finished_at=now(),claim_id=null,lease_until=null where id=v_q.id;
    return jsonb_build_object('finalized',false);
  end if;
  if v_q.claim_revision<>v_q.device_revision and p_outcome<>'sent' then
    -- A negative result about an old token says nothing about the replacement.
    update private.native_push_deliveries set
      status=case when attempt_count<5 then 'pending' else 'failed' end,
      next_attempt_at=now(),claim_id=null,lease_until=null,
      finished_at=case when attempt_count<5 then null else now() end where id=v_q.id;
    return jsonb_build_object('finalized',false);
  end if;
  if p_outcome='unregistered' then
    update private.native_push_devices set enabled=false,disabled_reason='unregistered',revision=gen_random_uuid(),updated_at=now()
    where installation_id=v_q.installation_id and revision=v_q.device_revision;
  end if;
  update private.native_push_deliveries set
    status=case when p_outcome='sent' then 'sent' when p_outcome='retry' and attempt_count<5 then 'pending' else 'failed' end,
    next_attempt_at=now()+make_interval(secs=>least(3600,60*(2^attempt_count)::integer)),
    finished_at=case when p_outcome='retry' and attempt_count<5 then null else now() end,
    claim_id=null,lease_until=null where id=v_q.id;
  return jsonb_build_object('finalized',true);
end;
$$;

revoke all on function public.app_native_push_save(uuid,text,text) from public,anon,authenticated,service_role;
grant execute on function public.app_native_push_save(uuid,text,text) to authenticated;

revoke all on function public.app_native_push_status(uuid) from public,anon,authenticated,service_role;
grant execute on function public.app_native_push_status(uuid) to authenticated;

revoke all on function public.app_native_push_disable(uuid) from public,anon,authenticated,service_role;
grant execute on function public.app_native_push_disable(uuid) to authenticated;

revoke all on function public.app_native_notification_claim(integer) from public,anon,authenticated,service_role;
grant execute on function public.app_native_notification_claim(integer) to service_role;

revoke all on function public.app_native_notification_prepare(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.app_native_notification_prepare(uuid,uuid) to service_role;

revoke all on function public.app_native_notification_finalize(uuid,uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.app_native_notification_finalize(uuid,uuid,text) to service_role;

revoke all on function private.app_notification_member_matches(uuid,text,jsonb),private.app_notification_fanout(integer),private.app_notification_capture(),private.app_native_push_eligible(uuid,uuid,uuid) from public,anon,authenticated,service_role;
notify pgrst,'reload schema';
