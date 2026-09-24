-- Repair the deployed mobile-push RPCs. NULLIF is a SQL expression,
-- not a pg_catalog-qualified function.
begin;

create or replace function public.member_push_subscription_status(p_endpoint text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION_REQUIRED';
  end if;

  if nullif(pg_catalog.btrim(p_endpoint), '') is null then
    raise exception using errcode = '22023', message = 'INVALID_PUSH_SUBSCRIPTION';
  end if;

  return pg_catalog.jsonb_build_object(
    'enabled', exists (
      select 1
      from public.member_push_subscriptions
      where user_id = v_uid and endpoint = p_endpoint and enabled
    )
  );
end;
$$;

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

  if nullif(pg_catalog.btrim(p_endpoint), '') is null
    or nullif(pg_catalog.btrim(p_p256dh), '') is null
    or nullif(pg_catalog.btrim(p_auth), '') is null then
    raise exception using errcode = '22023', message = 'INVALID_PUSH_SUBSCRIPTION';
  end if;

  insert into public.member_push_subscriptions (
    user_id,
    endpoint,
    p256dh,
    auth_key
  ) values (
    v_uid,
    p_endpoint,
    p_p256dh,
    p_auth
  )
  on conflict (endpoint) do update
  set user_id = excluded.user_id,
      p256dh = excluded.p256dh,
      auth_key = excluded.auth_key,
      enabled = true,
      updated_at = pg_catalog.now()
  returning * into v_subscription;

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

create or replace function public.member_push_subscription_disable(p_endpoint text)
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

  if nullif(pg_catalog.btrim(p_endpoint), '') is null then
    raise exception using errcode = '22023', message = 'INVALID_PUSH_SUBSCRIPTION';
  end if;

  update public.member_push_subscriptions
  set enabled = false,
      updated_at = pg_catalog.now()
  where user_id = v_uid and endpoint = p_endpoint
  returning * into v_subscription;

  return pg_catalog.jsonb_build_object(
    'disabled', v_subscription.id is not null,
    'endpoint', p_endpoint
  );
end;
$$;

revoke all on function public.member_push_subscription_status(text) from public, anon;
revoke all on function public.member_push_subscription_save(text, text, text) from public, anon;
revoke all on function public.member_push_subscription_disable(text) from public, anon;

grant execute on function public.member_push_subscription_status(text) to authenticated;
grant execute on function public.member_push_subscription_save(text, text, text) to authenticated;
grant execute on function public.member_push_subscription_disable(text) to authenticated;

commit;
