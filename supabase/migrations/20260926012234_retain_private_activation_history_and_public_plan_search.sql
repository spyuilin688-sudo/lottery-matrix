-- Preserve every private redemption even when the current entitlement snapshot changes.
-- Keep the one-row-per-member table for the existing admin read path.
create table public.private_activation_redemption_history (
  code_id uuid primary key,
  member_id uuid not null references public.members(id) on delete cascade,
  current_plan_id uuid,
  plan_started_at timestamptz,
  plan_expires_at timestamptz,
  is_lifetime boolean not null,
  redeemed_at timestamptz not null
);
create index private_activation_redemption_history_member_idx
  on public.private_activation_redemption_history (member_id);
alter table public.private_activation_redemption_history enable row level security;
revoke all on table public.private_activation_redemption_history from public, anon, authenticated;
grant select, insert on table public.private_activation_redemption_history to service_role;

insert into public.private_activation_redemption_history (
  code_id, member_id, current_plan_id, plan_started_at, plan_expires_at, is_lifetime, redeemed_at
)
select code_id, member_id, current_plan_id, plan_started_at, plan_expires_at, is_lifetime, redeemed_at
from public.private_activation_redemptions;

create function private.keep_private_activation_redemption_history()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and old.code_id is distinct from new.code_id then
    insert into public.private_activation_redemption_history (
      code_id, member_id, current_plan_id, plan_started_at, plan_expires_at, is_lifetime, redeemed_at
    ) values (
      old.code_id, old.member_id, old.current_plan_id, old.plan_started_at,
      old.plan_expires_at, old.is_lifetime, old.redeemed_at
    ) on conflict (code_id) do nothing;
  end if;

  insert into public.private_activation_redemption_history (
    code_id, member_id, current_plan_id, plan_started_at, plan_expires_at, is_lifetime, redeemed_at
  ) values (
    new.code_id, new.member_id, new.current_plan_id, new.plan_started_at,
    new.plan_expires_at, new.is_lifetime, new.redeemed_at
  ) on conflict (code_id) do nothing;
  return new;
end;
$$;
revoke all on function private.keep_private_activation_redemption_history() from public, anon, authenticated;
create trigger keep_private_activation_redemption_history
after insert or update on public.private_activation_redemptions
for each row execute function private.keep_private_activation_redemption_history();

-- PostgREST computed field: search only the plan that the administrator may see.
-- The owner continues to use the existing plan-name relationship search.
create function private.member_has_current_private_activation(public.members)
returns boolean language sql stable security invoker set search_path = '' as $$
  select exists (
    select 1 from public.private_activation_redemptions as snapshot
    where snapshot.member_id = $1.id
      and row(snapshot.current_plan_id, snapshot.plan_started_at,
        snapshot.plan_expires_at, snapshot.is_lifetime)
        is not distinct from row($1.current_plan_id, $1.plan_started_at,
          $1.plan_expires_at, $1.is_lifetime)
  );
$$;
revoke all on function private.member_has_current_private_activation(public.members) from public, anon, authenticated;
grant execute on function private.member_has_current_private_activation(public.members) to service_role;

create function public.admin_visible_plan_name(public.members)
returns text language sql stable security invoker set search_path = '' as $$
  select plan.name
  from public.plans as plan
  where plan.id = $1.current_plan_id
    and not private.member_has_current_private_activation($1);
$$;
revoke all on function public.admin_visible_plan_name(public.members) from public, anon, authenticated;
grant execute on function public.admin_visible_plan_name(public.members) to service_role;

create function public.admin_visible_plan_duration(public.members)
returns integer language sql stable security invoker set search_path = '' as $$
  select plan.duration_days
  from public.plans as plan
  where plan.id = $1.current_plan_id
    and not private.member_has_current_private_activation($1);
$$;
revoke all on function public.admin_visible_plan_duration(public.members) from public, anon, authenticated;
grant execute on function public.admin_visible_plan_duration(public.members) to service_role;

create function public.admin_visible_plan_started_at(public.members)
returns timestamptz language sql stable security invoker set search_path = '' as $$
  select case when private.member_has_current_private_activation($1)
    then null::timestamptz else $1.plan_started_at end;
$$;
revoke all on function public.admin_visible_plan_started_at(public.members) from public, anon, authenticated;
grant execute on function public.admin_visible_plan_started_at(public.members) to service_role;

create function public.admin_visible_plan_expires_at(public.members)
returns timestamptz language sql stable security invoker set search_path = '' as $$
  select case when private.member_has_current_private_activation($1)
    then null::timestamptz else $1.plan_expires_at end;
$$;
revoke all on function public.admin_visible_plan_expires_at(public.members) from public, anon, authenticated;
grant execute on function public.admin_visible_plan_expires_at(public.members) to service_role;

notify pgrst, 'reload schema';
