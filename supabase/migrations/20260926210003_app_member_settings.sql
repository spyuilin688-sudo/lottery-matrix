create table public.app_notification_settings (
  member_id uuid primary key references public.app_members(id) on delete cascade,
  settings jsonb not null check(jsonb_typeof(settings)='object'),
  updated_at timestamptz not null default now()
);
alter table public.app_members
  add column last_online_at timestamptz,
  add column total_online_seconds bigint not null default 0,
  add column online_session_count bigint not null default 0;
create table public.app_member_online_sessions (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.app_members(id) on delete cascade,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  online_seconds integer check(online_seconds>=0),
  created_at timestamptz not null default now()
);
create index app_member_online_sessions_member_idx on public.app_member_online_sessions(member_id,started_at desc);
alter table public.app_notification_settings enable row level security;
alter table public.app_member_online_sessions enable row level security;
revoke all on public.app_notification_settings,public.app_member_online_sessions from public,anon,authenticated;
grant select,insert,update,delete on public.app_notification_settings,public.app_member_online_sessions to service_role;

create function private.default_app_notification_settings()
returns jsonb language sql immutable set search_path='' as $$
  select jsonb_set(private.default_member_notification_settings(),'{settings}',
    '{"bet":false,"result":false,"status":false,"card":false,"collision":false,"system":false,"expiry":false}'::jsonb)
$$;
create function private.validate_app_notification_settings(p_settings jsonb)
returns jsonb language plpgsql immutable set search_path='' as $$
declare v_defaults jsonb:=private.default_app_notification_settings(); v_group text; v_key text; v_value jsonb; v_allowed jsonb;
begin
  p_settings:=p_settings #- '{settings,win}' #- '{selectedOptions,win}';
  if jsonb_typeof(p_settings) is distinct from 'object'
    or (select count(*) from jsonb_object_keys(p_settings))<>5
    or not(p_settings ?& array['settings','selectedOptions','betTimes','statusOptions','collisionOptions'])
  then raise exception using errcode='22023',message='INVALID_NOTIFICATION_SETTINGS'; end if;
  for v_group in select jsonb_object_keys(v_defaults) loop
    if jsonb_typeof(p_settings->v_group) is distinct from 'object'
      or (select count(*) from jsonb_object_keys(p_settings->v_group))<>(select count(*) from jsonb_object_keys(v_defaults->v_group))
      or not (p_settings->v_group ?& array(select jsonb_object_keys(v_defaults->v_group)))
    then raise exception using errcode='22023',message='INVALID_NOTIFICATION_SETTINGS'; end if;
    for v_key in select jsonb_object_keys(v_defaults->v_group) loop
      v_value:=p_settings->v_group->v_key;
      if v_group='settings' then
        if jsonb_typeof(v_value) is distinct from 'boolean' then raise exception using errcode='22023',message='INVALID_NOTIFICATION_SETTINGS'; end if;
      else
        if jsonb_typeof(v_value) is distinct from 'array' then raise exception using errcode='22023',message='INVALID_NOTIFICATION_SETTINGS'; end if;
        if v_group='betTimes' then
          v_allowed:=case v_key
            when '天天樂' then '["","05:00","05:30","06:00","06:30","07:00","07:30","08:00","08:30","08:45","09:00","09:10","09:20","09:25"]'::jsonb
            when '六合彩' then '["","17:00","17:30","18:00","18:30","19:00","19:30","20:00","20:30","20:45","21:00","21:10","21:20","21:25"]'::jsonb
            else '["","16:00","16:30","17:00","17:30","18:00","18:30","19:00","19:30","19:45","20:00","20:10","20:20","20:25"]'::jsonb end;
          if jsonb_array_length(v_value)<>2 then raise exception using errcode='22023',message='INVALID_NOTIFICATION_SETTINGS'; end if;
        else
          v_allowed:=v_defaults->v_group->v_key;
          if jsonb_array_length(v_value)>jsonb_array_length(v_allowed)
            or (select count(distinct value) from jsonb_array_elements(v_value))<>jsonb_array_length(v_value)
          then raise exception using errcode='22023',message='INVALID_NOTIFICATION_SETTINGS'; end if;
        end if;
        if exists(select 1 from jsonb_array_elements(v_value) element where jsonb_typeof(element)<>'string' or not(v_allowed @> jsonb_build_array(element)))
        then raise exception using errcode='22023',message='INVALID_NOTIFICATION_SETTINGS'; end if;
      end if;
    end loop;
  end loop;
  return p_settings;
exception when data_exception then
  raise exception using errcode='22023',message='INVALID_NOTIFICATION_SETTINGS';
end;
$$;
create function public.app_notification_settings_get()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_member uuid:=private.active_app_member_id(); v_settings jsonb;
begin
  select settings into v_settings from public.app_notification_settings where member_id=v_member;
  return coalesce(v_settings,private.default_app_notification_settings());
end;
$$;
create function public.app_notification_settings_save(p_settings jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_member uuid:=private.active_app_member_id();
begin
  p_settings:=private.validate_app_notification_settings(p_settings);
  insert into public.app_notification_settings(member_id,settings) values(v_member,p_settings)
    on conflict(member_id) do update set settings=excluded.settings,updated_at=now();
  return p_settings;
end;
$$;
create function public.app_member_online_start()
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_member uuid:=private.active_app_member_id(); v_session uuid;
begin
  insert into public.app_member_online_sessions(member_id) values(v_member) returning id into v_session;
  update public.app_members set last_online_at=now() where id=v_member;
  return jsonb_build_object('sessionId',v_session);
end;
$$;
create function public.app_member_online_end(p_session_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_member uuid:=private.active_app_member_id(); v_row public.app_member_online_sessions%rowtype; v_seconds integer;
begin
  select * into v_row from public.app_member_online_sessions where id=p_session_id and member_id=v_member for update;
  if not found then raise exception using errcode='22023',message='MEMBER_ONLINE_SESSION_NOT_FOUND'; end if;
  if v_row.online_seconds is not null then return jsonb_build_object('onlineSeconds',v_row.online_seconds); end if;
  v_seconds:=greatest(0,floor(extract(epoch from now()-v_row.started_at))::integer);
  update public.app_member_online_sessions set ended_at=now(),online_seconds=v_seconds where id=p_session_id;
  update public.app_members set last_online_at=now(),total_online_seconds=total_online_seconds+v_seconds,
    online_session_count=online_session_count+1 where id=v_member;
  return jsonb_build_object('onlineSeconds',v_seconds);
end;
$$;
revoke all on function private.default_app_notification_settings(),private.validate_app_notification_settings(jsonb)
  from public,anon,authenticated,service_role;
revoke all on function public.app_notification_settings_get(),public.app_notification_settings_save(jsonb),
  public.app_member_online_start(),public.app_member_online_end(uuid) from public,anon,authenticated,service_role;
grant execute on function public.app_notification_settings_get(),public.app_notification_settings_save(jsonb),
  public.app_member_online_start(),public.app_member_online_end(uuid) to authenticated;
notify pgrst,'reload schema';
