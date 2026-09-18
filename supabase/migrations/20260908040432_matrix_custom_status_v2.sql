begin;

-- Pure validation helpers are private and never exposed through the Data API.
create or replace function private.matrix_custom_status_road_types(p_types jsonb, p_can_composite boolean)
returns jsonb
language plpgsql
immutable
security invoker
set search_path = ''
as $$
declare
  v_type jsonb;
  v_types jsonb;
begin
  if pg_catalog.jsonb_typeof(p_types) is distinct from 'array' then
    raise exception using errcode = '22023', message = 'INVALID_REQUEST';
  end if;
  if pg_catalog.jsonb_array_length(p_types) = 0 then
    raise exception using errcode = '22023', message = 'INVALID_REQUEST';
  end if;
  for v_type in select value from pg_catalog.jsonb_array_elements(p_types) loop
    if pg_catalog.jsonb_typeof(v_type) is distinct from 'string'
      or v_type #>> '{}' not in ('加減', '合值', '拖牌', '複合') then
      raise exception using errcode = '22023', message = 'INVALID_REQUEST';
    end if;
    if v_type = '"複合"'::jsonb and p_can_composite is not true then
      raise exception using errcode = '42501', message = 'FORBIDDEN';
    end if;
  end loop;
  select pg_catalog.jsonb_agg(value order by value) into v_types
  from (select distinct value from pg_catalog.jsonb_array_elements(p_types)) as types;
  if pg_catalog.jsonb_array_length(v_types) <> pg_catalog.jsonb_array_length(p_types) then
    raise exception using errcode = '22023', message = 'INVALID_REQUEST';
  end if;
  return v_types;
end;
$$;

create or replace function private.matrix_custom_status_normalize_config(p_config jsonb, p_can_composite boolean)
returns jsonb
language plpgsql
immutable
security invoker
set search_path = ''
as $$
declare
  v_legacy boolean;
  v_section text;
  v_groups jsonb;
  v_group jsonb;
  v_rows jsonb;
  v_row jsonb;
  v_result jsonb;
  v_seen_ids text[] := array[]::text[];
  v_seen_rows jsonb[];
  v_road_key jsonb;
  v_alternative jsonb;
  v_alternative_key jsonb;
  v_alternative_keys jsonb[];
  v_alternatives_key jsonb;
  v_alternative_union jsonb;
  v_row_key jsonb;
  v_allowed_streaks integer[];
  v_streak integer;
  v_min numeric;
  v_max numeric;
begin
  if pg_catalog.jsonb_typeof(p_config) is distinct from 'object' then
    raise exception using errcode = '22023', message = 'INVALID_REQUEST';
  end if;
  if (p_config ? 'schemaVersion') and p_config->'schemaVersion' not in ('1'::jsonb, '2'::jsonb) then
    raise exception using errcode = '22023', message = 'INVALID_REQUEST';
  end if;
  v_legacy := not (p_config ? 'schemaVersion') or p_config->'schemaVersion' = '1'::jsonb;
  if pg_catalog.jsonb_typeof(p_config->'lottery') is distinct from 'string'
    or p_config->>'lottery' not in ('今彩539', '天天樂', '六合彩', '大樂透')
    or pg_catalog.jsonb_typeof(p_config->'status') is distinct from 'string'
    or p_config->>'status' not in ('ACTIVE', 'FOCUS', 'RESONANCE', 'CRITICAL')
    or p_config->'explorePeriods' is distinct from '13'::jsonb
    or p_config->'exploreRange' is distinct from '"完整範圍"'::jsonb then
    raise exception using errcode = '22023', message = 'INVALID_REQUEST';
  end if;
  v_result := p_config || '{"schemaVersion":2}'::jsonb;
  foreach v_section in array array['oneCodeGroups', 'twoCodeGroups'] loop
    if pg_catalog.jsonb_typeof(p_config->v_section) is distinct from 'array' then
      raise exception using errcode = '22023', message = 'INVALID_REQUEST';
    end if;
    if pg_catalog.jsonb_array_length(p_config->v_section) > 20 then
      raise exception using errcode = '22023', message = 'INVALID_REQUEST';
    end if;
    v_allowed_streaks := case when v_section = 'oneCodeGroups' then array[4,5,6,7] else array[5,6,7,9,11] end;
    v_groups := '[]'::jsonb;
    for v_group in select value from pg_catalog.jsonb_array_elements(p_config->v_section) loop
      if pg_catalog.jsonb_typeof(v_group) is distinct from 'object'
        or pg_catalog.jsonb_typeof(v_group->'id') is distinct from 'string'
        or pg_catalog.btrim(v_group->>'id') = ''
        or (v_group->>'id') = any(v_seen_ids)
        or pg_catalog.jsonb_typeof(v_group->'rows') is distinct from 'array' then
        raise exception using errcode = '22023', message = 'INVALID_REQUEST';
      end if;
      if pg_catalog.jsonb_array_length(v_group->'rows') not between 1 and 10 then
        raise exception using errcode = '22023', message = 'INVALID_REQUEST';
      end if;
      v_seen_ids := pg_catalog.array_append(v_seen_ids, v_group->>'id');
      v_seen_rows := array[]::jsonb[];
      v_rows := '[]'::jsonb;
      for v_row in select value from pg_catalog.jsonb_array_elements(v_group->'rows') loop
        if pg_catalog.jsonb_typeof(v_row) is distinct from 'object' then
          raise exception using errcode = '22023', message = 'INVALID_REQUEST';
        end if;
        if v_legacy then
          if pg_catalog.jsonb_typeof(v_row->'consecutive') is distinct from 'string'
            or not exists (
              select 1 from pg_catalog.unnest(v_allowed_streaks) as allowed(streak)
              where v_row->>'consecutive' = '準' || streak::text || '進' || (streak + 1)::text
            ) then
            raise exception using errcode = '22023', message = 'INVALID_REQUEST';
          end if;
          select streak into v_streak from pg_catalog.unnest(v_allowed_streaks) as allowed(streak)
          where v_row->>'consecutive' = '準' || streak::text || '進' || (streak + 1)::text;
          -- Legacy count was a minimum, never an exact count or bounded maximum.
          v_row := (v_row - 'consecutive' - 'roadType' - 'sameCodeQuantity') || pg_catalog.jsonb_build_object(
            'consecutiveMin', v_streak, 'consecutiveMax', v_streak,
            'roadTypes', pg_catalog.jsonb_build_array(v_row->'roadType'), 'roadRelation', 'any',
            'sameCodeMin', v_row->'sameCodeQuantity', 'sameCodeMax', null
          );
        end if;
        if pg_catalog.jsonb_typeof(v_row->'consecutiveMin') is distinct from 'number'
          or pg_catalog.jsonb_typeof(v_row->'consecutiveMax') is distinct from 'number'
          or pg_catalog.jsonb_typeof(v_row->'sameCodeMin') is distinct from 'number'
          or not (v_row ? 'sameCodeMax')
          or (v_row->'sameCodeMax' <> 'null'::jsonb and pg_catalog.jsonb_typeof(v_row->'sameCodeMax') is distinct from 'number')
          or pg_catalog.jsonb_typeof(v_row->'roadRelation') is distinct from 'string'
          or v_row->>'roadRelation' not in ('any','all')
          or pg_catalog.jsonb_typeof(v_row->'numberOrder') is distinct from 'string'
          or v_row->>'numberOrder' not in ('依號碼由小到大排序', '依實際開獎順序排序') then
          raise exception using errcode = '22023', message = 'INVALID_REQUEST';
        end if;
        v_min := (v_row->>'consecutiveMin')::numeric;
        v_max := (v_row->>'consecutiveMax')::numeric;
        if not (v_min = any(v_allowed_streaks)) or not (v_max = any(v_allowed_streaks)) or v_min > v_max then
          raise exception using errcode = '22023', message = 'INVALID_REQUEST';
        end if;
        v_min := (v_row->>'sameCodeMin')::numeric;
        v_max := (v_row->>'sameCodeMax')::numeric;
        if v_min not between 1 and 99 or v_min <> pg_catalog.trunc(v_min)
          or (v_max is not null and (v_max not between 1 and 99 or v_max <> pg_catalog.trunc(v_max) or v_min > v_max)) then
          raise exception using errcode = '22023', message = 'INVALID_REQUEST';
        end if;
        v_road_key := private.matrix_custom_status_road_types(v_row->'roadTypes', p_can_composite);
        v_alternatives_key := 'null'::jsonb;
        if v_row ? 'roadTypeAlternatives' then
          if pg_catalog.jsonb_typeof(v_row->'roadTypeAlternatives') is distinct from 'array'
            or v_row->>'roadRelation' <> 'all' then
            raise exception using errcode = '22023', message = 'INVALID_REQUEST';
          end if;
          if pg_catalog.jsonb_array_length(v_row->'roadTypeAlternatives') = 0 then
            raise exception using errcode = '22023', message = 'INVALID_REQUEST';
          end if;
          v_alternative_keys := array[]::jsonb[];
          v_alternative_union := '[]'::jsonb;
          for v_alternative in select value from pg_catalog.jsonb_array_elements(v_row->'roadTypeAlternatives') loop
            -- Validate entitlement before set membership, including hidden composite alternatives.
            v_alternative_key := private.matrix_custom_status_road_types(v_alternative, p_can_composite);
            if v_alternative_key = any(v_alternative_keys) then
              raise exception using errcode = '22023', message = 'INVALID_REQUEST';
            end if;
            v_alternative_keys := pg_catalog.array_append(v_alternative_keys, v_alternative_key);
            v_alternative_union := v_alternative_union || v_alternative_key;
          end loop;
          select pg_catalog.jsonb_agg(value order by value) into v_alternative_union
          from (select distinct value from pg_catalog.jsonb_array_elements(v_alternative_union)) as types;
          if v_alternative_union <> v_road_key then
            raise exception using errcode = '22023', message = 'INVALID_REQUEST';
          end if;
          select pg_catalog.jsonb_agg(value order by value) into v_alternatives_key
          from pg_catalog.unnest(v_alternative_keys) as alternatives(value);
        end if;
        v_row_key := pg_catalog.jsonb_build_array(
          v_row->'consecutiveMin', v_row->'consecutiveMax', v_road_key, v_row->'roadRelation',
          v_row->'numberOrder', v_row->'sameCodeMin', v_row->'sameCodeMax', v_alternatives_key
        );
        if v_row_key = any(v_seen_rows) then
          raise exception using errcode = '22023', message = 'INVALID_REQUEST';
        end if;
        v_seen_rows := pg_catalog.array_append(v_seen_rows, v_row_key);
        v_rows := v_rows || pg_catalog.jsonb_build_array(v_row);
      end loop;
      v_groups := v_groups || pg_catalog.jsonb_build_array(v_group || pg_catalog.jsonb_build_object('rows',v_rows));
    end loop;
    v_result := v_result || pg_catalog.jsonb_build_object(v_section,v_groups);
  end loop;
  return v_result;
end;
$$;

-- Preserve the authenticated RPC and member ownership check. Existing stored
-- V1 rows remain intact and list/reset keep their current behavior.
create or replace function public.matrix_custom_status_save(p_config jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_member_id uuid;
  v_entitlements jsonb;
  v_config jsonb;
begin
  if v_uid is null then raise exception using errcode = '42501', message = 'AUTH_REQUIRED'; end if;
  select id into v_member_id from public.members where auth_user_id = v_uid limit 1;
  if v_member_id is null then raise exception using errcode = '42501', message = 'FORBIDDEN'; end if;
  v_entitlements := private.matrix_result_entitlements();
  if (v_entitlements->>'canCustomizeStatus')::boolean is not true then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;
  v_config := private.matrix_custom_status_normalize_config(p_config, (v_entitlements->>'canUseCompositeCustomRoad')::boolean);
  insert into public.matrix_custom_status_configs (member_id, lottery, status, config, updated_at)
  values (v_member_id, v_config->>'lottery', v_config->>'status', v_config, pg_catalog.now())
  on conflict (member_id, lottery, status) do update
    set config = excluded.config, updated_at = excluded.updated_at;
  return pg_catalog.jsonb_build_object('item', v_config);
end;
$$;

revoke all on function private.matrix_custom_status_road_types(jsonb, boolean) from public, anon, authenticated;
revoke all on function private.matrix_custom_status_normalize_config(jsonb, boolean) from public, anon, authenticated;
revoke all on function public.matrix_custom_status_save(jsonb) from public, anon, authenticated;
grant execute on function public.matrix_custom_status_save(jsonb) to authenticated;

commit;
