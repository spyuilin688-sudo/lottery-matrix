-- Additive native transport. Existing notification objects are read-only inputs.
create table private.native_push_devices (
  installation_id uuid primary key,
  auth_user_id uuid not null,
  member_id uuid not null,
  session_id uuid not null,
  token text not null check (length(token) between 20 and 4096),
  platform text not null check (platform = 'android'),
  enabled boolean not null default true,
  disabled_reason text check (disabled_reason in ('user','unregistered','superseded')),
  enabled_at timestamptz not null default now(),
  revision uuid not null default gen_random_uuid(),
  updated_at timestamptz not null default now()
);
create unique index native_push_active_token on private.native_push_devices(token) where enabled;
create index native_push_member on private.native_push_devices(member_id) where enabled;
alter table private.native_push_devices enable row level security;
revoke all on private.native_push_devices from public, anon, authenticated, service_role;

create table private.native_push_deliveries (
  id uuid primary key default gen_random_uuid(),
  outbox_id uuid not null,
  installation_id uuid not null references private.native_push_devices(installation_id),
  device_revision uuid not null,
  status text not null default 'pending' check (status in ('pending','processing','sent','failed','canceled')),
  attempt_count integer not null default 0 check (attempt_count between 0 and 5),
  next_attempt_at timestamptz not null default now(),
  claim_id uuid,
  claim_revision uuid,
  lease_until timestamptz,
  created_at timestamptz not null default now(),
  finished_at timestamptz,
  unique(outbox_id,installation_id)
);
create index native_push_ready on private.native_push_deliveries(next_attempt_at,created_at) where status in ('pending','processing');
alter table private.native_push_deliveries enable row level security;
revoke all on private.native_push_deliveries from public, anon, authenticated, service_role;

create function private.native_push_session_valid(p_uid uuid,p_session uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_uid is not null and p_session is not null and exists (
    select 1 from auth.sessions s where s.id=p_session and s.user_id=p_uid
    and (s.not_after is null or s.not_after>now())
  );
$$;
revoke all on function private.native_push_session_valid(uuid,uuid) from public, anon, authenticated, service_role;

create function private.native_push_current_session()
returns uuid language plpgsql stable security definer set search_path = '' as $$
declare v_session uuid;
begin
  begin v_session := (auth.jwt()->>'session_id')::uuid;
  exception when invalid_text_representation then raise exception using errcode='42501',message='AUTH_REQUIRED'; end;
  if not private.native_push_session_valid(auth.uid(),v_session) then
    raise exception using errcode='42501',message='AUTH_REQUIRED';
  end if;
  return v_session;
end;
$$;
revoke all on function private.native_push_current_session() from public, anon, authenticated, service_role;

create function public.member_native_push_save(p_installation_id uuid,p_token text,p_platform text)
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
revoke all on function public.member_native_push_save(uuid,text,text) from public, anon, authenticated, service_role;
grant execute on function public.member_native_push_save(uuid,text,text) to authenticated;

create function public.member_native_push_status(p_installation_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_session uuid; v_member uuid;
begin
  begin v_session:=private.native_push_current_session(); v_member:=private.active_member_id();
  exception when insufficient_privilege then return jsonb_build_object('enabled',false,'refreshable',false); end;
  return jsonb_build_object('enabled',exists(select 1 from private.native_push_devices d
    where d.installation_id=p_installation_id and d.auth_user_id=auth.uid() and d.member_id=v_member
    and d.session_id=v_session and d.enabled),
    'refreshable',exists(select 1 from private.native_push_devices d
    where d.installation_id=p_installation_id and d.auth_user_id=auth.uid() and d.member_id=v_member
    and d.session_id=v_session and not d.enabled and d.disabled_reason='unregistered'));
end;
$$;
revoke all on function public.member_native_push_status(uuid) from public, anon, authenticated, service_role;
grant execute on function public.member_native_push_status(uuid) to authenticated;

create function public.member_native_push_disable(p_installation_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_session uuid:=private.native_push_current_session(); v_member uuid:=private.active_member_id(); v_count integer;
begin
  update private.native_push_devices set enabled=false,disabled_reason='user',revision=gen_random_uuid(),updated_at=now()
  where installation_id=p_installation_id and auth_user_id=auth.uid() and member_id=v_member and session_id=v_session;
  get diagnostics v_count=row_count;
  return jsonb_build_object('disabled',v_count>0);
end;
$$;
revoke all on function public.member_native_push_disable(uuid) from public, anon, authenticated, service_role;
grant execute on function public.member_native_push_disable(uuid) to authenticated;

create function private.native_push_eligible(p_installation uuid,p_revision uuid,p_outbox uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from private.native_push_devices d
    join public.members m on m.id=d.member_id and m.auth_user_id=d.auth_user_id
    join public.notification_outbox o on o.id=p_outbox and o.member_id=d.member_id
    join public.notification_events e on e.id=o.event_id
    where d.installation_id=p_installation and d.revision=p_revision and d.enabled
      and o.created_at>=d.enabled_at and coalesce(m.status,'') not in ('停用','disabled','inactive')
      and private.native_push_session_valid(d.auth_user_id,d.session_id)
      and private.notification_member_matches(d.member_id,e.event_type,e.payload));
$$;
revoke all on function private.native_push_eligible(uuid,uuid,uuid) from public, anon, authenticated, service_role;

create function public.native_notification_claim(p_limit integer default 20)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_result jsonb;
begin
  insert into private.native_push_deliveries(outbox_id,installation_id,device_revision)
  select o.id,d.installation_id,d.revision from private.native_push_devices d
    join public.notification_outbox o on o.member_id=d.member_id and o.created_at>=d.enabled_at
    where d.enabled and private.native_push_eligible(d.installation_id,d.revision,o.id)
      and not exists(select 1 from private.native_push_deliveries q where q.outbox_id=o.id and q.installation_id=d.installation_id)
    order by o.created_at,o.id,d.installation_id limit 1000
    on conflict(outbox_id,installation_id) do nothing;
  update private.native_push_deliveries set status='failed',finished_at=now(),claim_id=null,lease_until=null
    where status='processing' and lease_until<=now() and attempt_count>=5;
  with candidates as (
    select q.id from private.native_push_deliveries q
    where ((q.status='pending' and q.next_attempt_at<=now()) or (q.status='processing' and q.lease_until<=now()))
      and q.attempt_count<5 order by q.created_at,q.id
      limit greatest(1,least(coalesce(p_limit,20),20)) for update skip locked
  ), claimed as (
    update private.native_push_deliveries q set status='processing',attempt_count=q.attempt_count+1,
      claim_id=gen_random_uuid(),claim_revision=q.device_revision,lease_until=now()+interval '2 minutes'
    from candidates c where q.id=c.id returning q.id,q.claim_id
  ) select coalesce(jsonb_agg(jsonb_build_object('delivery_id',id,'claim_id',claim_id)),'[]'::jsonb) into v_result from claimed;
  return v_result;
end;
$$;
revoke all on function public.native_notification_claim(integer) from public, anon, authenticated, service_role;
grant execute on function public.native_notification_claim(integer) to service_role;

create function public.native_notification_prepare(p_delivery_id uuid,p_claim_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_q private.native_push_deliveries%rowtype; v_result jsonb;
begin
  select * into v_q from private.native_push_deliveries where id=p_delivery_id and claim_id=p_claim_id
    and status='processing' and lease_until>now() for update;
  if not found then return null; end if;
  -- Rotation retains this lease for an old in-flight sender. It must not start
  -- another send using a token different from the one recorded on its claim.
  if v_q.claim_revision<>v_q.device_revision then return null; end if;
  if not private.native_push_eligible(v_q.installation_id,v_q.device_revision,v_q.outbox_id) then
    update private.native_push_deliveries set status='canceled',finished_at=now(),claim_id=null,lease_until=null where id=v_q.id;
    return null;
  end if;
  select jsonb_build_object('token',d.token,'outbox_id',o.id,'notification_payload',o.notification_payload)
    into v_result from private.native_push_devices d join public.notification_outbox o on o.id=v_q.outbox_id
    where d.installation_id=v_q.installation_id and d.revision=v_q.device_revision;
  return v_result;
end;
$$;
revoke all on function public.native_notification_prepare(uuid,uuid) from public, anon, authenticated, service_role;
grant execute on function public.native_notification_prepare(uuid,uuid) to service_role;

create function public.native_notification_finalize(p_delivery_id uuid,p_claim_id uuid,p_outcome text)
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
revoke all on function public.native_notification_finalize(uuid,uuid,text) from public, anon, authenticated, service_role;
grant execute on function public.native_notification_finalize(uuid,uuid,text) to service_role;
