begin;

create or replace function private.notification_member_matches(
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
    coalesce(setting.settings, private.default_member_notification_settings()),
    member.status
  into v_settings, v_member_status
  from public.members as member
  left join public.notification_settings as setting
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
    return v_enabled
      and p_payload->>'memberId' = p_member_id::text;
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

revoke all on function private.notification_member_matches(uuid, text, jsonb)
  from public, anon, authenticated, service_role;

commit;
