begin;

create table public.admin_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default pg_catalog.now()
);

create table public.plans (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  name text not null unique,
  price integer not null check (price > 0),
  duration_days integer not null check (duration_days > 0)
);

create table public.members (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  auth_user_id uuid not null unique references auth.users (id) on delete cascade,
  line_user_id text unique,
  registered_at timestamptz not null default pg_catalog.now(),
  current_plan_id uuid references public.plans (id) on delete set null,
  plan_started_at timestamptz,
  plan_expires_at timestamptz,
  is_lifetime boolean not null default false,
  status text,
  referral_code text,
  invitation_code text,
  constraint members_lifetime_expiry_check check (
    (is_lifetime and plan_expires_at is null)
    or (not is_lifetime and plan_expires_at is not null)
  )
);

create table public.transfer_requests (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  member_id uuid not null references public.members (id),
  plan_id uuid not null references public.plans (id),
  amount integer not null check (amount > 0),
  transferred_at timestamptz not null,
  account_last_five text not null check (account_last_five ~ '^[0-9]{5}$'),
  submitted_at timestamptz not null default pg_catalog.now(),
  status text not null default 'pending'
    check (status in ('pending', 'confirmed', 'rejected'))
);

create table public.payments (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  member_id uuid not null references public.members (id),
  plan_id uuid not null references public.plans (id),
  amount integer not null check (amount > 0),
  paid_at timestamptz,
  status text not null default 'pending'
    check (status in ('pending', 'confirmed', 'rejected'))
);

create table public.activation_code_batches (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  duration_type text not null
    check (duration_type in ('7_days', '15_days', '30_days', '90_days', '365_days', 'lifetime')),
  quantity integer not null default 10 check (quantity = 10),
  created_at timestamptz not null default pg_catalog.now(),
  expires_at timestamptz not null,
  constraint activation_code_batches_expiry_check check (
    expires_at = created_at + interval '1 month'
  ),
  unique (id, duration_type)
);

create table public.activation_codes (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  batch_id uuid not null,
  code text not null unique
    check (code ~ '^[A-Z0-9]{4}(-[A-Z0-9]{4}){3}$'),
  duration_type text not null
    check (duration_type in ('7_days', '15_days', '30_days', '90_days', '365_days', 'lifetime')),
  created_at timestamptz not null default pg_catalog.now(),
  expires_at timestamptz not null,
  redeemed_by_member_id uuid references public.members (id),
  redeemed_at timestamptz,
  status text not null default 'unused'
    check (status in ('unused', 'used', 'expired')),
  constraint activation_codes_batch_duration_fkey
    foreign key (batch_id, duration_type)
    references public.activation_code_batches (id, duration_type),
  constraint activation_codes_expiry_check check (
    expires_at = created_at + interval '1 month'
  ),
  constraint activation_codes_redemption_state_check check (
    (status = 'unused' and redeemed_by_member_id is null and redeemed_at is null)
    or (status = 'used' and redeemed_by_member_id is not null and redeemed_at is not null)
    or (status = 'expired' and redeemed_by_member_id is null and redeemed_at is null)
  )
);

insert into public.plans (name, price, duration_days)
values ('月費方案', 1880, 30), ('季費方案', 4580, 90);

create index members_current_plan_id_idx
  on public.members (current_plan_id);
create index members_registered_at_idx
  on public.members (registered_at desc);
create index members_plan_expires_at_idx
  on public.members (plan_expires_at);
create index transfer_requests_member_id_idx
  on public.transfer_requests (member_id);
create index transfer_requests_plan_id_idx
  on public.transfer_requests (plan_id);
create index transfer_requests_status_submitted_at_idx
  on public.transfer_requests (status, submitted_at desc);
create index payments_member_id_idx
  on public.payments (member_id);
create index payments_plan_id_idx
  on public.payments (plan_id);
create index payments_status_paid_at_idx
  on public.payments (status, paid_at desc);
create index activation_code_batches_created_at_idx
  on public.activation_code_batches (created_at desc);
create index activation_codes_batch_id_idx
  on public.activation_codes (batch_id);
create index activation_codes_status_created_at_idx
  on public.activation_codes (status, created_at desc);
create index activation_codes_expires_at_idx
  on public.activation_codes (expires_at);
create index activation_codes_redeemed_by_member_id_idx
  on public.activation_codes (redeemed_by_member_id);

alter table public.admin_profiles enable row level security;
alter table public.members enable row level security;
alter table public.plans enable row level security;
alter table public.transfer_requests enable row level security;
alter table public.payments enable row level security;
alter table public.activation_code_batches enable row level security;
alter table public.activation_codes enable row level security;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1
      from public.admin_profiles
      where user_id = (select auth.uid())
    );
$$;

create policy "Admins can read admin profiles"
  on public.admin_profiles
  for select
  to authenticated
  using ((select public.is_admin()));

create policy "Admins can read members"
  on public.members
  for select
  to authenticated
  using ((select public.is_admin()));

create policy "Members can read their own record"
  on public.members
  for select
  to authenticated
  using (
    (select auth.uid()) is not null
    and auth_user_id = (select auth.uid())
  );

create policy "Admins can read plans"
  on public.plans
  for select
  to authenticated
  using ((select public.is_admin()));

create policy "Admins can read transfer requests"
  on public.transfer_requests
  for select
  to authenticated
  using ((select public.is_admin()));

create policy "Admins can read payments"
  on public.payments
  for select
  to authenticated
  using ((select public.is_admin()));

create policy "Admins can read activation code batches"
  on public.activation_code_batches
  for select
  to authenticated
  using ((select public.is_admin()));

create policy "Admins can read activation codes"
  on public.activation_codes
  for select
  to authenticated
  using ((select public.is_admin()));

create or replace function public.admin_dashboard_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if (select auth.uid()) is null then
    raise exception using
      errcode = '42501',
      message = 'AUTHENTICATION_REQUIRED';
  end if;

  if not public.is_admin() then
    raise exception using
      errcode = '42501',
      message = 'ADMIN_REQUIRED';
  end if;

  select pg_catalog.jsonb_build_object(
    'total_members', (select pg_catalog.count(*) from public.members),
    'today_members', (
      select pg_catalog.count(*)
      from public.members
      where registered_at >= current_date::timestamptz
        and registered_at < (current_date + 1)::timestamptz
    ),
    'paid_members', (
      select pg_catalog.count(distinct member_id)
      from public.payments
      where status = 'confirmed'
    ),
    'active_members', (
      select pg_catalog.count(*)
      from public.members
      where is_lifetime or plan_expires_at > pg_catalog.now()
    ),
    'expired_members', (
      select pg_catalog.count(*)
      from public.members
      where not is_lifetime and plan_expires_at <= pg_catalog.now()
    ),
    'today_confirmed_amount', (
      select coalesce(pg_catalog.sum(amount), 0)
      from public.payments
      where status = 'confirmed'
        and paid_at >= current_date::timestamptz
        and paid_at < (current_date + 1)::timestamptz
    ),
    'month_confirmed_amount', (
      select coalesce(pg_catalog.sum(amount), 0)
      from public.payments
      where status = 'confirmed'
        and paid_at >= pg_catalog.date_trunc('month', pg_catalog.now())
        and paid_at < pg_catalog.date_trunc('month', pg_catalog.now()) + interval '1 month'
    ),
    'lifetime_confirmed_amount', (
      select coalesce(pg_catalog.sum(amount), 0)
      from public.payments
      where status = 'confirmed'
    )
  )
  into v_result;

  return v_result;
end;
$$;

create or replace function public.generate_activation_code_batch(p_duration_type text)
returns setof public.activation_codes
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_batch_id uuid;
  v_created_at timestamptz := pg_catalog.now();
  v_inserted_count integer := 0;
  v_row_count integer;
  v_raw_code text;
  v_code text;
  v_random_bytes bytea;
begin
  if (select auth.uid()) is null then
    raise exception using
      errcode = '42501',
      message = 'AUTHENTICATION_REQUIRED';
  end if;

  if not public.is_admin() then
    raise exception using
      errcode = '42501',
      message = 'ADMIN_REQUIRED';
  end if;

  if p_duration_type is null
     or p_duration_type not in ('7_days', '15_days', '30_days', '90_days', '365_days', 'lifetime') then
    raise exception using
      errcode = '22023',
      message = 'INVALID_DURATION_TYPE';
  end if;

  insert into public.activation_code_batches (
    duration_type,
    quantity,
    created_at,
    expires_at
  )
  values (
    p_duration_type,
    10,
    v_created_at,
    v_created_at + interval '1 month'
  )
  returning id into v_batch_id;

  while v_inserted_count < 10 loop
    v_random_bytes := extensions.gen_random_bytes(16);

    select pg_catalog.string_agg(
      pg_catalog.substr(
        'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
        (pg_catalog.get_byte(v_random_bytes, byte_index) % 36) + 1,
        1
      ),
      '' order by byte_index
    )
    into v_raw_code
    from pg_catalog.generate_series(0, 15) as generated(byte_index);

    v_code := pg_catalog.substr(v_raw_code, 1, 4)
      || '-' || pg_catalog.substr(v_raw_code, 5, 4)
      || '-' || pg_catalog.substr(v_raw_code, 9, 4)
      || '-' || pg_catalog.substr(v_raw_code, 13, 4);

    insert into public.activation_codes (
      batch_id,
      code,
      duration_type,
      created_at,
      expires_at,
      status
    )
    values (
      v_batch_id,
      v_code,
      p_duration_type,
      v_created_at,
      v_created_at + interval '1 month',
      'unused'
    )
    on conflict (code) do nothing;

    get diagnostics v_row_count = row_count;
    v_inserted_count := v_inserted_count + v_row_count;
  end loop;

  return query
    select activation_code.*
    from public.activation_codes as activation_code
    where activation_code.batch_id = v_batch_id
    order by activation_code.created_at, activation_code.id;
end;
$$;

create or replace function public.redeem_activation_code(p_code text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_auth_user_id uuid := (select auth.uid());
  v_normalized_code text := pg_catalog.upper(pg_catalog.btrim(p_code));
  v_now timestamptz := pg_catalog.now();
  v_activation_code public.activation_codes%rowtype;
  v_member public.members%rowtype;
  v_duration_days integer;
begin
  if v_auth_user_id is null then
    raise exception using
      errcode = '42501',
      message = 'AUTHENTICATION_REQUIRED';
  end if;

  if v_normalized_code is null
     or v_normalized_code !~ '^[A-Z0-9]{4}(-[A-Z0-9]{4}){3}$' then
    raise exception using
      errcode = '22023',
      message = 'INVALID_ACTIVATION_CODE_FORMAT';
  end if;

  select activation_code.*
  into v_activation_code
  from public.activation_codes as activation_code
  where activation_code.code = v_normalized_code
  for update;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'ACTIVATION_CODE_NOT_FOUND';
  end if;

  if v_activation_code.status = 'used'
     or v_activation_code.redeemed_at is not null then
    raise exception using
      errcode = 'P0001',
      message = 'ACTIVATION_CODE_ALREADY_USED';
  end if;

  if v_activation_code.status = 'expired'
     or v_activation_code.expires_at <= v_now then
    raise exception using
      errcode = 'P0001',
      message = 'ACTIVATION_CODE_EXPIRED';
  end if;

  select member.*
  into v_member
  from public.members as member
  where member.auth_user_id = v_auth_user_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'MEMBER_NOT_FOUND';
  end if;

  if v_activation_code.duration_type = 'lifetime' then
    update public.members
    set is_lifetime = true,
        plan_expires_at = null
    where id = v_member.id
    returning * into v_member;
  else
    if v_member.is_lifetime then
      raise exception using
        errcode = 'P0001',
        message = 'MEMBER_ALREADY_LIFETIME';
    end if;

    v_duration_days := case v_activation_code.duration_type
      when '7_days' then 7
      when '15_days' then 15
      when '30_days' then 30
      when '90_days' then 90
      when '365_days' then 365
    end;

    update public.members
    set plan_expires_at = greatest(
      coalesce(plan_expires_at, v_now),
      v_now
    ) + pg_catalog.make_interval(days => v_duration_days)
    where id = v_member.id
    returning * into v_member;
  end if;

  update public.activation_codes
  set status = 'used',
      redeemed_by_member_id = v_member.id,
      redeemed_at = v_now
  where id = v_activation_code.id;

  return pg_catalog.jsonb_build_object(
    'member_id', v_member.id,
    'duration_type', v_activation_code.duration_type,
    'is_lifetime', v_member.is_lifetime,
    'plan_expires_at', v_member.plan_expires_at,
    'redeemed_at', v_now
  );
end;
$$;

revoke all on table public.admin_profiles from public, anon, authenticated;
revoke all on table public.members from public, anon, authenticated;
revoke all on table public.plans from public, anon, authenticated;
revoke all on table public.transfer_requests from public, anon, authenticated;
revoke all on table public.payments from public, anon, authenticated;
revoke all on table public.activation_code_batches from public, anon, authenticated;
revoke all on table public.activation_codes from public, anon, authenticated;

grant select on table public.admin_profiles to anon, authenticated;
grant select on table public.members to anon, authenticated;
grant select on table public.plans to anon, authenticated;
grant select on table public.transfer_requests to anon, authenticated;
grant select on table public.payments to anon, authenticated;
grant select on table public.activation_code_batches to anon, authenticated;
grant select on table public.activation_codes to anon, authenticated;

revoke execute on function public.is_admin() from public, anon, authenticated, service_role;
revoke execute on function public.admin_dashboard_stats() from public, anon, authenticated, service_role;
revoke execute on function public.generate_activation_code_batch(text) from public, anon, authenticated, service_role;
revoke execute on function public.redeem_activation_code(text) from public, anon, authenticated, service_role;

grant execute on function public.is_admin() to authenticated;
grant execute on function public.admin_dashboard_stats() to authenticated;
grant execute on function public.generate_activation_code_batch(text) to authenticated;
grant execute on function public.redeem_activation_code(text) to authenticated;

commit;
