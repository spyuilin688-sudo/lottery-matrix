-- Restrict destinations at registration and require browser-key possession
-- before transferring an existing device subscription between accounts.
begin;
set local lock_timeout = '5s';

create or replace function private.member_push_endpoint_allowed(p_endpoint text)
returns boolean
language sql
immutable
strict
set search_path = ''
as $$
  select pg_catalog.length(p_endpoint) <= 4096
    and p_endpoint !~ '[[:space:][:cntrl:]#]'
    and pg_catalog.strpos(p_endpoint, pg_catalog.chr(92)) = 0
    and coalesce(
      pg_catalog.lower(pg_catalog.substring(p_endpoint, '^https://([^/?#]+)'))
        ~ '^(fcm[.]googleapis[.]com|([a-z0-9-]+[.])*push[.]services[.]mozilla[.]com|([a-z0-9-]+[.])*web[.]push[.]apple[.]com|([a-z0-9-]+[.])*notify[.]windows[.]com)$',
      false
    );
$$;

revoke all on function private.member_push_endpoint_allowed(text)
  from public, anon, authenticated, service_role;

create or replace function public.member_push_subscription_save(p_endpoint text, p_p256dh text, p_auth text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_subscription public.member_push_subscriptions%rowtype;
begin
  if v_uid is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION_REQUIRED';
  end if;

  if not coalesce(private.member_push_endpoint_allowed(p_endpoint), false)
    or nullif(pg_catalog.btrim(p_p256dh), '') is null
    or nullif(pg_catalog.btrim(p_auth), '') is null then
    raise exception using errcode = '22023', message = 'INVALID_PUSH_SUBSCRIPTION';
  end if;

  insert into public.member_push_subscriptions (
    user_id, endpoint, p256dh, auth_key
  ) values (
    v_uid, p_endpoint, p_p256dh, p_auth
  )
  on conflict (endpoint) do update
  set user_id = excluded.user_id,
      p256dh = excluded.p256dh,
      auth_key = excluded.auth_key,
      enabled = true,
      updated_at = pg_catalog.now()
  where member_push_subscriptions.user_id = v_uid
     or (member_push_subscriptions.p256dh = excluded.p256dh
         and member_push_subscriptions.auth_key = excluded.auth_key)
  returning * into v_subscription;

  if not found then
    raise exception using errcode = '22023', message = 'INVALID_PUSH_SUBSCRIPTION';
  end if;

  return pg_catalog.jsonb_build_object(
    'id', v_subscription.id,
    'endpoint', v_subscription.endpoint,
    'enabled', v_subscription.enabled,
    'createdAt', v_subscription.created_at,
    'updatedAt', v_subscription.updated_at,
    'lastSuccessAt', v_subscription.last_success_at,
    'lastFailureAt', v_subscription.last_failure_at
  );
end;
$$;

revoke all on function public.member_push_subscription_save(text, text, text) from public, anon;
grant execute on function public.member_push_subscription_save(text, text, text) to authenticated;
commit;
