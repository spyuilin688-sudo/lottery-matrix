-- Resolve one 30-recipient page in one service-role call. Project only fields
-- needed by the notification UI; keep full Auth metadata and device rows private.
create or replace function public.admin_push_member_details(p_auth_user_ids uuid[])
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if p_auth_user_ids is null or cardinality(p_auth_user_ids) > 30 then
    raise exception using errcode = '22023', message = 'INVALID_MEMBER_IDS';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', u.id,
      'user_metadata', jsonb_build_object(
        'name', u.raw_user_meta_data->'name',
        'full_name', u.raw_user_meta_data->'full_name',
        'picture', u.raw_user_meta_data->'picture'),
      'identities', coalesce((
        select jsonb_agg(jsonb_build_object(
          'provider', i.provider, 'provider_id', i.provider_id,
          'identity_data', jsonb_build_object(
            'name', i.identity_data->'name',
            'full_name', i.identity_data->'full_name',
            'sub', i.identity_data->'sub',
            'picture', i.identity_data->'picture')
        ) order by i.created_at, i.id)
        from auth.identities i where i.user_id = u.id
      ), '[]'::jsonb),
      'push_enabled', exists (
        select 1 from public.member_push_subscriptions s
        where s.user_id = u.id and s.enabled = true)
    ) order by u.id)
    from auth.users u
    where u.id = any(p_auth_user_ids)
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.admin_push_member_details(uuid[]) from public, anon, authenticated;
grant execute on function public.admin_push_member_details(uuid[]) to service_role;
