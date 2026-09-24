-- The display setting is deliberately independent of authentication and entitlements.
alter table private.matrix_permission_settings
  add column ecpay_review_login_visible boolean not null default false;

create or replace function public.matrix_permission_settings()
returns jsonb language sql stable security definer set search_path = ''
as $function$
  select pg_catalog.jsonb_build_object(
    'subscriptionPurchaseVisible', subscription_purchase_visible,
    'registeredMemberFreeAccess', registered_member_free_access,
    'ecpayReviewLoginVisible', ecpay_review_login_visible,
    'revision', revision, 'updatedAt', updated_at
  ) from private.matrix_permission_settings where singleton;
$function$;
revoke all on function public.matrix_permission_settings() from public;
grant execute on function public.matrix_permission_settings() to anon, authenticated, service_role;

-- Only a server-provisioned review member with full membership may use this entry.
-- This check grants no privileges and never reads the display setting.
create function public.ecpay_review_access()
returns boolean language sql stable security definer set search_path = ''
as $function$
  select auth.uid() is not null and exists (
    select 1 from auth.users as u join public.members as m on m.auth_user_id = u.id
    where u.id = auth.uid()
      and u.raw_app_meta_data->>'ecpay_review' = 'true'
      and m.is_lifetime = true
      and coalesce(m.status, '') not in ('停用', 'disabled', 'inactive')
  );
$function$;
revoke all on function public.ecpay_review_access() from public, anon;
grant execute on function public.ecpay_review_access() to authenticated;

-- Native administrator updater for the private Matrix permission settings.
-- The public read RPC remains unchanged for PWA consumers.
create or replace function public.admin_matrix_permission_settings_update(
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
    or coalesce(p_change->>'key', '') not in ('subscriptionPurchaseVisible', 'registeredMemberFreeAccess', 'ecpayReviewLoginVisible')
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
      ecpay_review_login_visible = case
        when p_change->>'key' = 'ecpayReviewLoginVisible'
          then (p_change->>'value')::boolean
        else ecpay_review_login_visible
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
