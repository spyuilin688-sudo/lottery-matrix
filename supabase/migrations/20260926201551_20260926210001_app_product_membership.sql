-- Product membership is explicit. Auth identity creation is not PWA enrollment.
create table public.app_members (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique references auth.users(id) on delete cascade,
  display_name text,
  status text not null default 'active' check (status in ('active','disabled')),
  entitlement_revision integer not null default 1 check (entitlement_revision > 0),
  registered_at timestamptz not null default now()
);
create table public.app_entitlements (
  member_id uuid primary key references public.app_members(id) on delete cascade,
  source text not null default 'free_launch' check (source = 'free_launch'),
  created_at timestamptz not null default now()
);
create table public.app_subscriptions (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.app_members(id) on delete cascade,
  source_event_id text not null unique,
  status text not null check (status in ('active','expired','cancelled')),
  starts_at timestamptz not null,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  check (expires_at is null or expires_at > starts_at)
);
create table public.app_revenue_entries (
  id uuid primary key default gen_random_uuid(),
  member_id uuid references public.app_members(id) on delete set null,
  source_event_id text not null unique,
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  gross_minor bigint not null,
  occurred_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index app_subscriptions_member_idx on public.app_subscriptions(member_id);
create index app_revenue_entries_member_idx on public.app_revenue_entries(member_id);
alter table public.app_members enable row level security;
alter table public.app_entitlements enable row level security;
alter table public.app_subscriptions enable row level security;
alter table public.app_revenue_entries enable row level security;
revoke all on public.app_members, public.app_entitlements, public.app_subscriptions,
  public.app_revenue_entries from public, anon, authenticated;
grant select on public.app_members, public.app_entitlements, public.app_subscriptions to authenticated;
grant select, insert, update, delete on public.app_members, public.app_entitlements,
  public.app_subscriptions, public.app_revenue_entries to service_role;
create policy app_members_self on public.app_members for select to authenticated
  using (auth_user_id = (select auth.uid()));
create policy app_entitlements_self on public.app_entitlements for select to authenticated
  using (exists (select 1 from public.app_members m where m.id=member_id and m.auth_user_id=(select auth.uid())));
create policy app_subscriptions_self on public.app_subscriptions for select to authenticated
  using (exists (select 1 from public.app_members m where m.id=member_id and m.auth_user_id=(select auth.uid())));

-- Keep historical classification after a session expires, until its user is deleted.
create table private.product_session_usage (
  session_id uuid not null references public.member_login_records(id) on delete cascade,
  product text not null check (product in ('pwa','app')),
  first_used_at timestamptz not null default now(),
  primary key (session_id, product)
);
create table private.product_identity_lifecycle (
  auth_user_id uuid primary key references auth.users(id) on delete cascade,
  app_deleted_at timestamptz,
  deletion_id uuid,
  auth_cleanup_state text not null default 'idle' check (auth_cleanup_state in ('idle','pending','complete'))
);
revoke all on private.product_session_usage, private.product_identity_lifecycle from public,anon,authenticated;
grant usage on schema private to service_role;
grant select on private.product_session_usage to service_role;

-- This one-time backfill does not reclassify future authentication as product use.
insert into private.product_session_usage(session_id,product)
select r.id,'pwa' from public.member_login_records r
where exists (select 1 from public.members m where m.auth_user_id=r.auth_user_id);
create view public.pwa_member_login_records with (security_invoker=true) as
select r.* from public.member_login_records r join private.product_session_usage u
  on u.session_id=r.id and u.product='pwa';
create view public.app_member_login_records with (security_invoker=true) as
select r.* from public.member_login_records r join private.product_session_usage u
  on u.session_id=r.id and u.product='app';
create view public.pwa_member_latest_connections with (security_invoker=true) as
select distinct on (auth_user_id) auth_user_id,last_connection_ip,last_connection_at
from public.pwa_member_login_records order by auth_user_id,last_connection_at desc,id desc;
create view public.app_member_latest_connections with (security_invoker=true) as
select distinct on (auth_user_id) auth_user_id,last_connection_ip,last_connection_at
from public.app_member_login_records order by auth_user_id,last_connection_at desc,id desc;
revoke all on public.pwa_member_login_records,public.app_member_login_records,
  public.pwa_member_latest_connections,public.app_member_latest_connections from public,anon,authenticated;
grant select on public.pwa_member_login_records,public.app_member_login_records,
  public.pwa_member_latest_connections,public.app_member_latest_connections to service_role;

create function private.product_session_id()
returns uuid language plpgsql stable security definer set search_path='' as $$
declare v_session uuid;
begin
  begin v_session := (auth.jwt()->>'session_id')::uuid;
  exception when invalid_text_representation then
    raise exception using errcode='42501',message='AUTH_REQUIRED';
  end;
  if auth.uid() is null or v_session is null or not exists (
    select 1 from auth.sessions where id=v_session and user_id=auth.uid()
      and (not_after is null or not_after > now())
  ) then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  return v_session;
end;
$$;
create function private.lock_product_identity(p_uid uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
  if p_uid is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_uid::text, 9142026));
  insert into private.product_identity_lifecycle(auth_user_id) values(p_uid) on conflict do nothing;
  if exists (select 1 from private.product_identity_lifecycle where auth_user_id=p_uid and auth_cleanup_state='pending')
  then raise exception using errcode='42501',message='ACCOUNT_DELETION_PENDING'; end if;
end;
$$;
create function private.record_product_session(p_session uuid,p_product text)
returns void language plpgsql security definer set search_path='' as $$
begin
  -- Capture is deliberately resilient at Auth time; repair missing telemetry here.
  insert into public.member_login_records(id,auth_user_id,login_at,login_ip,last_connection_ip,last_connection_at)
  select id,user_id,coalesce(created_at,now()),ip,ip,coalesce(updated_at,created_at,now())
  from auth.sessions where id=p_session and user_id=auth.uid()
  on conflict (id) do nothing;
  insert into private.product_session_usage(session_id,product) values(p_session,p_product) on conflict do nothing;
end;
$$;

create or replace function private.sync_line_member_from_identity()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.provider is distinct from 'custom:line' or nullif(btrim(new.provider_id),'') is null then return new; end if;
  update public.members m set line_user_id=new.provider_id,
    line_display_name=coalesce(nullif(btrim(new.identity_data->>'name'),''),m.line_display_name)
  where m.auth_user_id=new.user_id and not exists (
    select 1 from public.members other where other.line_user_id=new.provider_id and other.auth_user_id<>new.user_id
  );
  return new;
exception when others then
  raise warning 'LINE member profile synchronization failed [%]',sqlstate;
  return new;
end;
$$;

create or replace function public.member_bootstrap()
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_session uuid := private.product_session_id(); v_result jsonb;
begin
  perform private.lock_product_identity(auth.uid());
  perform private.bootstrap_member_allowed();
  v_result := public.member_bootstrap_20260829_impl();
  update public.members m set line_display_name=nullif(btrim(i.identity_data->>'name'),'')
  from auth.identities i where m.auth_user_id=auth.uid() and i.user_id=m.auth_user_id
    and i.provider='custom:line' and m.line_user_id=i.provider_id
    and nullif(btrim(i.identity_data->>'name'),'') is not null
    and m.line_display_name is distinct from nullif(btrim(i.identity_data->>'name'),'');
  perform private.record_product_session(v_session,'pwa');
  return v_result;
end;
$$;
create function public.app_member_bootstrap(p_rejoin boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_session uuid := private.product_session_id(); v_member public.app_members%rowtype; v_name text;
begin
  perform private.lock_product_identity(auth.uid());
  if exists (select 1 from private.product_identity_lifecycle where auth_user_id=auth.uid() and app_deleted_at is not null) then
    if p_rejoin is distinct from true then raise exception using errcode='42501',message='APP_ACCOUNT_DELETED'; end if;
    update private.product_identity_lifecycle set app_deleted_at=null,deletion_id=null,auth_cleanup_state='idle' where auth_user_id=auth.uid();
  end if;
  select nullif(btrim(identity_data->>'name'),'') into v_name from auth.identities
    where user_id=auth.uid() order by (provider='custom:line') desc,created_at,id limit 1;
  insert into public.app_members(auth_user_id,display_name) values(auth.uid(),v_name) on conflict (auth_user_id) do nothing;
  select * into v_member from public.app_members where auth_user_id=auth.uid();
  if v_member.status <> 'active' then raise exception using errcode='42501',message='FORBIDDEN'; end if;
  insert into public.app_entitlements(member_id) values(v_member.id) on conflict do nothing;
  perform private.record_product_session(v_session,'app');
  return jsonb_build_object('memberId',v_member.id);
end;
$$;
create function private.active_app_member_id()
returns uuid language plpgsql stable security definer set search_path='' as $$
declare v_id uuid;
begin
  perform private.product_session_id();
  if exists(select 1 from private.product_identity_lifecycle where auth_user_id=auth.uid() and app_deleted_at is not null)
  then raise exception using errcode='42501',message='APP_ACCOUNT_DELETED'; end if;
  select id into v_id from public.app_members where auth_user_id=auth.uid() and status='active';
  if v_id is null then raise exception using errcode='42501',message='FORBIDDEN'; end if;
  return v_id;
end;
$$;
create function public.app_member_profile()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_member public.app_members%rowtype; v_enabled boolean;
begin
  perform private.product_session_id();
  if exists(select 1 from private.product_identity_lifecycle where auth_user_id=auth.uid() and app_deleted_at is not null)
  then raise exception using errcode='42501',message='APP_ACCOUNT_DELETED'; end if;
  select * into v_member from public.app_members where auth_user_id=auth.uid();
  if not found then raise exception using errcode='42501',message='FORBIDDEN'; end if;
  v_enabled := v_member.status='active' and exists(select 1 from public.app_entitlements where member_id=v_member.id and source='free_launch');
  return jsonb_build_object('memberId',v_member.id,'displayName',v_member.display_name,
    'status',v_member.status,'entitlementSource','free_launch','entitlementRevision',v_member.entitlement_revision,
    'entitlements',jsonb_build_object('canUseSeven',v_enabled,'canUseThirteen',v_enabled,
      'canUseFullRange',v_enabled,'canUseTianyan',v_enabled,'canUseTiangong',v_enabled,'canViewFullStatus',v_enabled));
end;
$$;
revoke all on function private.product_session_id(),private.lock_product_identity(uuid),
  private.record_product_session(uuid,text),private.active_app_member_id(),private.sync_line_member_from_identity()
  from public,anon,authenticated;
revoke all on function public.member_bootstrap(),public.app_member_bootstrap(boolean),public.app_member_profile()
  from public,anon,authenticated;
grant execute on function public.member_bootstrap(),public.app_member_bootstrap(boolean),public.app_member_profile() to authenticated;
-- Policies call a narrowly scoped verifier by OID. private remains outside the API.
grant execute on function private.product_session_id() to authenticated;
alter policy app_members_self on public.app_members using (
  auth_user_id = (select auth.uid()) and (select private.product_session_id()) is not null
);
notify pgrst,'reload schema';
