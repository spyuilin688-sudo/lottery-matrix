create or replace function public.admin_member_ids_by_display_name(p_keyword text)
returns table (member_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select distinct m.id as member_id
  from public.members as m
  left join auth.users as u
    on u.id = m.auth_user_id
  left join lateral (
    select i.identity_data
    from auth.identities as i
    where i.user_id = u.id
      and i.provider = 'google'
    limit 1
  ) as google_identity on true
  cross join lateral (
    values (
      coalesce(
        nullif(btrim(m.line_display_name), ''),
        nullif(btrim(u.raw_user_meta_data ->> 'name'), ''),
        nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''),
        nullif(btrim(google_identity.identity_data ->> 'name'), ''),
        nullif(btrim(google_identity.identity_data ->> 'full_name'), '')
      )
    )
  ) as resolved(display_name)
  where p_keyword is not null
    and char_length(btrim(p_keyword)) between 1 and 200
    and resolved.display_name is not null
    and strpos(lower(resolved.display_name), lower(btrim(p_keyword))) > 0
  order by m.id;
$$;

revoke all on function public.admin_member_ids_by_display_name(text) from public, anon, authenticated;
grant execute on function public.admin_member_ids_by_display_name(text) to service_role;
