begin;

create or replace function private.default_member_notification_settings()
returns jsonb
language sql
immutable
security invoker
set search_path = ''
as $$
  select pg_catalog.jsonb_build_object(
    'settings', pg_catalog.jsonb_build_object(
      'bet', true, 'result', true, 'win', true, 'status', true,
      'card', true, 'collision', false, 'system', true, 'expiry', true
    ),
    'selectedOptions', pg_catalog.jsonb_build_object(
      'result', pg_catalog.jsonb_build_array('今彩539', '天天樂', '六合彩', '大樂透'),
      'win', pg_catalog.jsonb_build_array('彩種通知'),
      'status', pg_catalog.jsonb_build_array('今彩539', '天天樂', '六合彩', '大樂透'),
      'card', pg_catalog.jsonb_build_array('今彩539', '天天樂', '六合彩', '大樂透'),
      'system', pg_catalog.jsonb_build_array('維護', '更新'),
      'expiry', pg_catalog.jsonb_build_array('提前1日', '提前3日', '提前7日')
    ),
    'betTimes', pg_catalog.jsonb_build_object(
      '今彩539', pg_catalog.jsonb_build_array('', ''),
      '天天樂', pg_catalog.jsonb_build_array('', ''),
      '六合彩', pg_catalog.jsonb_build_array('', ''),
      '大樂透', pg_catalog.jsonb_build_array('', '')
    ),
    'statusOptions', pg_catalog.jsonb_build_object(
      '今彩539', pg_catalog.jsonb_build_array('啟動', '聚合', '共振', '臨界'),
      '天天樂', pg_catalog.jsonb_build_array('啟動', '聚合', '共振', '臨界'),
      '六合彩', pg_catalog.jsonb_build_array('啟動', '聚合', '共振', '臨界'),
      '大樂透', pg_catalog.jsonb_build_array('啟動', '聚合', '共振', '臨界')
    ),
    'collisionOptions', pg_catalog.jsonb_build_object(
      '今彩539', pg_catalog.jsonb_build_array('獨碰二星', '獨碰三星'),
      '天天樂', pg_catalog.jsonb_build_array('獨碰二星', '獨碰三星'),
      '六合彩', pg_catalog.jsonb_build_array('獨碰二星', '獨碰三星'),
      '大樂透', pg_catalog.jsonb_build_array('獨碰二星', '獨碰三星')
    )
  );
$$;

revoke all on function private.default_member_notification_settings() from public, anon, authenticated;

create or replace function private.active_member_id()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_member public.members%rowtype;
begin
  if v_uid is null then
    raise exception using errcode = '42501', message = 'AUTH_REQUIRED';
  end if;
  select * into v_member
  from public.members
  where auth_user_id = v_uid
  limit 1;
  if not found or pg_catalog.coalesce(v_member.status, '') in ('停用', 'disabled', 'inactive') then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;
  return v_member.id;
end;
$$;

revoke all on function private.active_member_id() from public, anon, authenticated;

create or replace function public.member_bootstrap()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_line_user_id text;
  v_member public.members%rowtype;
begin
  if v_uid is null then
    raise exception using errcode = '42501', message = 'AUTH_REQUIRED';
  end if;

  select nullif(pg_catalog.btrim(identity.provider_id), '')
    into v_line_user_id
  from auth.identities as identity
  where identity.user_id = v_uid
    and identity.provider = 'custom:line'
  order by identity.created_at
  limit 1;

  if v_line_user_id is null then
    raise exception using errcode = '42501', message = 'LINE_IDENTITY_REQUIRED';
  end if;

  if exists (
    select 1 from public.members
    where line_user_id = v_line_user_id and auth_user_id <> v_uid
  ) then
    raise exception using errcode = '23505', message = 'LINE_IDENTITY_CONFLICT';
  end if;

  insert into public.members (auth_user_id, line_user_id)
  values (v_uid, v_line_user_id)
  on conflict (auth_user_id) do update
    set line_user_id = excluded.line_user_id
    where public.members.line_user_id is null;

  select * into v_member
  from public.members
  where auth_user_id = v_uid
  limit 1;

  if not found
    or pg_catalog.coalesce(v_member.status, '') in ('停用', 'disabled', 'inactive')
    or v_member.line_user_id is distinct from v_line_user_id then
    raise exception using errcode = '23505', message = 'LINE_IDENTITY_CONFLICT';
  end if;

  return pg_catalog.jsonb_build_object(
    'memberId', v_member.id,
    'lineUserId', v_member.line_user_id
  );
exception
  when unique_violation then
    raise exception using errcode = '23505', message = 'LINE_IDENTITY_CONFLICT';
end;
$$;

create or replace function public.member_profile()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_member_id uuid := private.active_member_id();
  v_result jsonb;
begin
  select pg_catalog.jsonb_build_object(
    'lineUserId', member.line_user_id,
    'planName', case when member.is_lifetime then '終身方案' else plan.name end,
    'planExpiresAt', member.plan_expires_at,
    'isLifetime', member.is_lifetime
  ) into v_result
  from public.members as member
  left join public.plans as plan on plan.id = member.current_plan_id
  where member.id = v_member_id
  limit 1;

  if v_result is null then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;
  return v_result;
end;
$$;

create or replace function public.member_notification_settings_get()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_member_id uuid := private.active_member_id();
  v_settings jsonb;
begin
  select settings into v_settings
  from public.notification_settings
  where member_id = v_member_id;
  return pg_catalog.coalesce(v_settings, private.default_member_notification_settings());
end;
$$;

create or replace function public.member_notification_settings_save(p_settings jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member_id uuid := private.active_member_id();
  v_key_count integer;
begin
  select pg_catalog.count(*)::integer into v_key_count
  from pg_catalog.jsonb_object_keys(p_settings);
  if pg_catalog.jsonb_typeof(p_settings) <> 'object'
    or v_key_count <> 5
    or not (p_settings ?& array['settings', 'selectedOptions', 'betTimes', 'statusOptions', 'collisionOptions'])
    or pg_catalog.jsonb_typeof(p_settings->'settings') <> 'object'
    or pg_catalog.jsonb_typeof(p_settings->'selectedOptions') <> 'object'
    or pg_catalog.jsonb_typeof(p_settings->'betTimes') <> 'object'
    or pg_catalog.jsonb_typeof(p_settings->'statusOptions') <> 'object'
    or pg_catalog.jsonb_typeof(p_settings->'collisionOptions') <> 'object' then
    raise exception using errcode = '22023', message = 'INVALID_NOTIFICATION_SETTINGS';
  end if;

  insert into public.notification_settings (member_id, settings, updated_at)
  values (v_member_id, p_settings, pg_catalog.now())
  on conflict (member_id) do update
    set settings = excluded.settings, updated_at = excluded.updated_at;
  return p_settings;
exception
  when data_exception then
    raise exception using errcode = '22023', message = 'INVALID_NOTIFICATION_SETTINGS';
end;
$$;

create or replace function public.member_online_start()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member_id uuid := private.active_member_id();
  v_session_id uuid;
  v_now timestamptz := pg_catalog.now();
begin
  insert into public.member_online_sessions (member_id, started_at)
  values (v_member_id, v_now)
  returning id into v_session_id;
  update public.members set last_online_at = v_now where id = v_member_id;
  return pg_catalog.jsonb_build_object('sessionId', v_session_id);
end;
$$;

create or replace function public.member_online_end(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member_id uuid := private.active_member_id();
  v_started_at timestamptz;
  v_existing_seconds integer;
  v_online_seconds integer;
  v_now timestamptz := pg_catalog.now();
begin
  select started_at, online_seconds
    into v_started_at, v_existing_seconds
  from public.member_online_sessions
  where id = p_session_id and member_id = v_member_id
  for update;
  if not found then
    raise exception using errcode = '22023', message = 'MEMBER_ONLINE_SESSION_NOT_FOUND';
  end if;
  if v_existing_seconds is not null then
    return pg_catalog.jsonb_build_object('onlineSeconds', v_existing_seconds);
  end if;
  v_online_seconds := pg_catalog.greatest(
    0,
    pg_catalog.floor(extract(epoch from v_now - v_started_at))::integer
  );
  update public.member_online_sessions
    set ended_at = v_now, online_seconds = v_online_seconds
    where id = p_session_id;
  update public.members
    set last_online_at = v_now,
      total_online_seconds = total_online_seconds + v_online_seconds,
      online_session_count = online_session_count + 1
    where id = v_member_id;
  return pg_catalog.jsonb_build_object('onlineSeconds', v_online_seconds);
end;
$$;

revoke all on function public.member_bootstrap() from public, anon, authenticated;
revoke all on function public.member_profile() from public, anon, authenticated;
revoke all on function public.member_notification_settings_get() from public, anon, authenticated;
revoke all on function public.member_notification_settings_save(jsonb) from public, anon, authenticated;
revoke all on function public.member_online_start() from public, anon, authenticated;
revoke all on function public.member_online_end(uuid) from public, anon, authenticated;

grant execute on function public.member_bootstrap() to authenticated;
grant execute on function public.member_profile() to authenticated;
grant execute on function public.member_notification_settings_get() to authenticated;
grant execute on function public.member_notification_settings_save(jsonb) to authenticated;
grant execute on function public.member_online_start() to authenticated;
grant execute on function public.member_online_end(uuid) to authenticated;

commit;
