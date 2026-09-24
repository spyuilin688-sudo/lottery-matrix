-- PostgREST can filter this computed field within a single paged query.
-- Resolve the same first visible name as the former private ID lookup.
create or replace function public.admin_member_display_name(p_member public.members)
returns text language sql stable security definer set search_path = '' as $$
  select coalesce(
    nullif(btrim(p_member.line_display_name), ''),
    (select coalesce(nullif(btrim(u.raw_user_meta_data->>'name'), ''),
                     nullif(btrim(u.raw_user_meta_data->>'full_name'), ''))
     from auth.users u where u.id = p_member.auth_user_id),
    (select coalesce(nullif(btrim(i.identity_data->>'name'), ''),
                     nullif(btrim(i.identity_data->>'full_name'), ''))
     from auth.identities i
     where i.user_id = p_member.auth_user_id and i.provider = 'google'
     order by i.created_at, i.id limit 1)
  );
$$;

revoke all on function public.admin_member_display_name(public.members) from public, anon, authenticated;
grant execute on function public.admin_member_display_name(public.members) to service_role;
notify pgrst, 'reload schema';
