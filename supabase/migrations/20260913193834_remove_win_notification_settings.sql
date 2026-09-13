-- Retire winning-notification preferences; keep all active preferences and auth gates.
CREATE OR REPLACE FUNCTION private.default_member_notification_settings()
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select pg_catalog.jsonb_build_object(
    'settings', pg_catalog.jsonb_build_object(
      'bet', true, 'result', true, 'status', true,
      'card', true, 'collision', false, 'system', true, 'expiry', true
    ),
    'selectedOptions', pg_catalog.jsonb_build_object(
      'result', pg_catalog.jsonb_build_array('今彩539', '天天樂', '六合彩', '大樂透'),
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
$function$;

CREATE OR REPLACE FUNCTION public.member_notification_settings_get_20260829_impl()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.uid();
  v_member_id uuid;
  v_settings jsonb;
begin
  if v_uid is null then
    raise exception using errcode = '42501', message = 'AUTH_REQUIRED';
  end if;
  select id into v_member_id from public.members where auth_user_id = v_uid limit 1;
  if v_member_id is null then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;
  select settings into v_settings
  from public.notification_settings
  where member_id = v_member_id;
  return coalesce(v_settings, private.default_member_notification_settings())
    #- '{settings,win}' #- '{selectedOptions,win}';
end;
$function$;

CREATE OR REPLACE FUNCTION public.member_notification_settings_save_20260829_impl(p_settings jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.uid();
  v_member_id uuid;
  v_key_count integer;
begin
  if v_uid is null then
    raise exception using errcode = '42501', message = 'AUTH_REQUIRED';
  end if;
  select id into v_member_id from public.members where auth_user_id = v_uid limit 1;
  if v_member_id is null then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  -- Retired fields from older installed clients are ignored, never stored.
  p_settings := p_settings #- '{settings,win}' #- '{selectedOptions,win}';
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
$function$;

update public.notification_settings
set settings = settings #- '{settings,win}' #- '{selectedOptions,win}'
where settings->'settings' ? 'win' or settings->'selectedOptions' ? 'win';
