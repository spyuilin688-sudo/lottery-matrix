-- Native administrator updater for the private Matrix permission settings.
-- The public read RPC remains unchanged for PWA consumers.
create function public.admin_matrix_permission_settings_update(
  p_admin_id uuid,
  p_change jsonb
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor public.admin_accounts%rowtype;
  v_settings private.matrix_permission_settings%rowtype;
  v_revision integer;
begin
  if coalesce(
    nullif(pg_catalog.current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
    pg_catalog.current_setting('request.jwt.claim.role', true),
    ''
  ) <> 'service_role' then
    raise exception using errcode = '42501', message = 'ADMIN_BACKEND_REQUIRED';
  end if;

  select * into v_actor
  from public.admin_accounts
  where id = p_admin_id
  for share;

  if not found or v_actor.status <> '啟用' or v_actor.role <> '超級管理員' then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  if p_change is null or pg_catalog.jsonb_typeof(p_change) <> 'object' then
    raise exception using errcode = '22023', message = 'INVALID_REQUEST';
  end if;
  if (select pg_catalog.count(*) from pg_catalog.jsonb_object_keys(p_change)) <> 3
    or coalesce(p_change->>'key', '') not in ('subscriptionPurchaseVisible', 'registeredMemberFreeAccess')
    or pg_catalog.jsonb_typeof(p_change->'value') is distinct from 'boolean'
    or pg_catalog.jsonb_typeof(p_change->'expectedRevision') is distinct from 'number'
    or coalesce(p_change->>'expectedRevision', '') !~ '^[0-9]+$' then
    raise exception using errcode = '22023', message = 'INVALID_REQUEST';
  end if;

  v_revision := (p_change->>'expectedRevision')::integer;
  select * into strict v_settings
  from private.matrix_permission_settings
  where singleton
  for update;

  if v_settings.revision <> v_revision then
    raise exception using errcode = 'PT409', message = 'SETTINGS_CONFLICT';
  end if;

  update private.matrix_permission_settings
  set subscription_purchase_visible = case
        when p_change->>'key' = 'subscriptionPurchaseVisible'
          then (p_change->>'value')::boolean
        else subscription_purchase_visible
      end,
      registered_member_free_access = case
        when p_change->>'key' = 'registeredMemberFreeAccess'
          then (p_change->>'value')::boolean
        else registered_member_free_access
      end,
      revision = revision + 1,
      updated_at = pg_catalog.clock_timestamp()
  where singleton;

  return public.matrix_permission_settings();
exception
  when numeric_value_out_of_range then
    raise exception using errcode = '22023', message = 'INVALID_REQUEST';
end;
$function$;

revoke all on function public.admin_matrix_permission_settings_update(uuid, jsonb)
from public, anon, authenticated;
grant execute on function public.admin_matrix_permission_settings_update(uuid, jsonb)
to service_role;

notify pgrst, 'reload schema';
