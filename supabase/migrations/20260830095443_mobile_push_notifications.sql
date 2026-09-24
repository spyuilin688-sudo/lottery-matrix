create table public.member_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth_key text not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_success_at timestamptz,
  last_failure_at timestamptz,
  unique (endpoint)
);

create table public.push_delivery_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  subscription_id uuid references public.member_push_subscriptions(id) on delete set null,
  title text not null,
  body text not null,
  status text not null check (status in ('sent', 'failed')),
  failure_reason text,
  admin_account text not null,
  sent_at timestamptz not null default now()
);

alter table public.member_push_subscriptions enable row level security;
alter table public.push_delivery_logs enable row level security;

revoke all on table public.member_push_subscriptions from public, anon;
revoke all on table public.push_delivery_logs from public, anon, authenticated;

grant select on table public.member_push_subscriptions to authenticated;
grant select, insert, update, delete on table public.member_push_subscriptions to service_role;
grant select, insert, update, delete on table public.push_delivery_logs to service_role;

create policy "Authenticated users can read their own push subscriptions"
  on public.member_push_subscriptions
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create function public.member_push_subscription_status(p_endpoint text)
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

  if pg_catalog.nullif(pg_catalog.btrim(p_endpoint), '') is null then
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

create function public.member_push_subscription_save(p_endpoint text, p_p256dh text, p_auth text)
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

  if pg_catalog.nullif(pg_catalog.btrim(p_endpoint), '') is null
    or pg_catalog.nullif(pg_catalog.btrim(p_p256dh), '') is null
    or pg_catalog.nullif(pg_catalog.btrim(p_auth), '') is null then
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

create function public.member_push_subscription_disable(p_endpoint text)
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

  if pg_catalog.nullif(pg_catalog.btrim(p_endpoint), '') is null then
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
