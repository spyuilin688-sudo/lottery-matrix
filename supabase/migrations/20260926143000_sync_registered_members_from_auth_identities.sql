begin;

create or replace function private.sync_registered_member_from_identity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.provider is distinct from 'google'
     and new.provider is distinct from 'custom:line' then
    return new;
  end if;

  insert into public.members (auth_user_id, registered_at)
  values (new.user_id, pg_catalog.coalesce(new.created_at, pg_catalog.now()))
  on conflict (auth_user_id) do nothing;

  return new;
end;
$$;

revoke all on function private.sync_registered_member_from_identity()
  from public, anon, authenticated;

drop trigger if exists sync_registered_member_from_identity on auth.identities;

create trigger sync_registered_member_from_identity
after insert or update of provider, user_id
on auth.identities
for each row
execute function private.sync_registered_member_from_identity();

insert into public.members (auth_user_id, registered_at)
select distinct on (identity.user_id)
  identity.user_id,
  pg_catalog.coalesce(identity.created_at, pg_catalog.now())
from auth.identities as identity
where identity.provider in ('google', 'custom:line')
  and not exists (
    select 1
    from public.members as member
    where member.auth_user_id = identity.user_id
  )
order by identity.user_id, identity.created_at asc nulls last
on conflict (auth_user_id) do nothing;

commit;
