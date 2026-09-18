-- Keep public.members synchronized with Supabase LINE identities.
-- The PWA bootstrap endpoint remains an idempotent fallback, but membership no
-- longer depends on a client-side request succeeding after authentication.

create schema if not exists private;
revoke all on schema private from public;
revoke all on schema private from anon, authenticated;

create or replace function private.sync_line_member_from_identity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.provider is distinct from 'custom:line'
     or nullif(btrim(new.provider_id), '') is null then
    return new;
  end if;

  update public.members as member
  set line_user_id = new.provider_id
  where member.auth_user_id = new.user_id
    and member.line_user_id is null
    and not exists (
      select 1
      from public.members as existing
      where existing.line_user_id = new.provider_id
        and existing.auth_user_id <> new.user_id
    );

  insert into public.members (auth_user_id, line_user_id, registered_at)
  select new.user_id, new.provider_id, coalesce(new.created_at, now())
  where not exists (
    select 1
    from public.members as member
    where member.auth_user_id = new.user_id
       or member.line_user_id = new.provider_id
  )
  on conflict do nothing;

  return new;
exception
  when others then
    raise warning 'LINE member synchronization failed for auth user %: %',
      new.user_id, sqlerrm;
    return new;
end;
$$;

revoke all on function private.sync_line_member_from_identity() from public;
revoke all on function private.sync_line_member_from_identity() from anon, authenticated;

drop trigger if exists sync_line_member_from_identity on auth.identities;

create trigger sync_line_member_from_identity
after insert or update of provider, provider_id, user_id
on auth.identities
for each row
execute function private.sync_line_member_from_identity();

update public.members as member
set line_user_id = identity.provider_id
from auth.identities as identity
where identity.provider = 'custom:line'
  and nullif(btrim(identity.provider_id), '') is not null
  and member.auth_user_id = identity.user_id
  and member.line_user_id is null
  and not exists (
    select 1
    from public.members as existing
    where existing.line_user_id = identity.provider_id
      and existing.auth_user_id <> identity.user_id
  );

insert into public.members (auth_user_id, line_user_id, registered_at)
select
  identity.user_id,
  identity.provider_id,
  coalesce(identity.created_at, now())
from auth.identities as identity
where identity.provider = 'custom:line'
  and nullif(btrim(identity.provider_id), '') is not null
  and not exists (
    select 1
    from public.members as member
    where member.auth_user_id = identity.user_id
       or member.line_user_id = identity.provider_id
  )
on conflict do nothing;
