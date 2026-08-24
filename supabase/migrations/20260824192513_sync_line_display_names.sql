-- Persist LINE display names for safe use in the authenticated admin dashboard.

alter table public.members
  add column if not exists line_display_name text;

comment on column public.members.line_display_name is
  'Display name synchronized from the custom:line identity. Never used as an authorization key.';

create or replace function private.sync_line_member_from_identity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  display_name text := nullif(btrim(new.identity_data->>'name'), '');
begin
  if new.provider is distinct from 'custom:line'
     or nullif(btrim(new.provider_id), '') is null then
    return new;
  end if;

  update public.members as member
  set line_user_id = new.provider_id,
      line_display_name = coalesce(display_name, member.line_display_name)
  where member.auth_user_id = new.user_id
    and not exists (
      select 1
      from public.members as existing
      where existing.line_user_id = new.provider_id
        and existing.auth_user_id <> new.user_id
    );

  insert into public.members (
    auth_user_id,
    line_user_id,
    line_display_name,
    registered_at
  )
  select
    new.user_id,
    new.provider_id,
    display_name,
    coalesce(new.created_at, now())
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

revoke all on function private.sync_line_member_from_identity()
  from public, anon, authenticated;

update public.members as member
set line_display_name = btrim(identity.identity_data->>'name')
from auth.identities as identity
where identity.provider = 'custom:line'
  and identity.user_id = member.auth_user_id
  and nullif(btrim(identity.identity_data->>'name'), '') is not null
  and member.line_display_name is distinct from btrim(identity.identity_data->>'name');
