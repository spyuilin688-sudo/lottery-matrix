-- Notification-recipient search returns only one page, including Auth name
-- fallbacks, instead of materializing every matching identity in the backend.
create or replace function public.admin_push_member_page(p_keyword text, p_page bigint default 1)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  result jsonb;
begin
  if p_page is null or p_page < 1 or p_page > 300239975158033
    or p_keyword is null or char_length(btrim(p_keyword)) > 200 then
    raise exception using errcode = '22023', message = 'INVALID_REQUEST';
  end if;
  with matches as materialized (
    select m.auth_user_id, m.line_user_id, m.line_display_name
    from public.members m
    left join auth.users u on u.id = m.auth_user_id
    left join lateral (
      select coalesce(nullif(btrim(i.identity_data->>'name'), ''), nullif(btrim(i.identity_data->>'full_name'), '')) as name
      from auth.identities i
      where i.user_id = m.auth_user_id
        and coalesce(nullif(btrim(i.identity_data->>'name'), ''), nullif(btrim(i.identity_data->>'full_name'), '')) is not null
      order by i.created_at, i.id
      limit 1
    ) identity_name on true
    where btrim(p_keyword) = ''
      or strpos(lower(coalesce(nullif(btrim(m.line_display_name), ''),
        nullif(btrim(u.raw_user_meta_data->>'name'), ''),
        nullif(btrim(u.raw_user_meta_data->>'full_name'), ''), identity_name.name, '')), lower(btrim(p_keyword))) > 0
      or strpos(lower(coalesce(m.line_user_id, '')), lower(btrim(p_keyword))) > 0
      or m.auth_user_id::text = lower(btrim(p_keyword))
      or exists (select 1 from auth.identities i where i.user_id = m.auth_user_id
        and i.provider = 'google'
        and strpos(lower(coalesce(nullif(btrim(i.provider_id), ''), i.identity_data->>'sub', '')), lower(btrim(p_keyword))) > 0)
  ), counts as (
    select count(*) as total from matches
  ), paging as (
    select total, greatest(1, (total + 29) / 30) as total_pages,
      least(p_page, greatest(1, (total + 29) / 30)) as current_page
    from counts
  ), page as (
    select auth_user_id, line_user_id, line_display_name from matches
    order by auth_user_id
    limit 30 offset (select (current_page - 1) * 30 from paging)
  )
  select jsonb_build_object('items', coalesce((select jsonb_agg(to_jsonb(page) order by auth_user_id) from page), '[]'::jsonb),
    'total', total, 'currentPage', current_page, 'totalPages', total_pages)
  into result from paging;
  return result;
end;
$$;
revoke all on function public.admin_push_member_page(text, bigint) from public, anon, authenticated;
grant execute on function public.admin_push_member_page(text, bigint) to service_role;

-- Resolve the recipients of the existing 200-row log window in one bounded
-- batch. No member/Auth collection is exposed to the browser or backend.
create or replace function public.admin_push_log_member_names(p_auth_user_ids uuid[])
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  if p_auth_user_ids is null or cardinality(p_auth_user_ids) > 200 then
    raise exception using errcode = '22023', message = 'INVALID_MEMBER_IDS';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('user_id', m.auth_user_id,
      'display_name', coalesce(nullif(btrim(m.line_display_name), ''),
        nullif(btrim(u.raw_user_meta_data->>'name'), ''),
        nullif(btrim(u.raw_user_meta_data->>'full_name'), ''), identity_name.name,
        'LINE ID：' || nullif(btrim(m.line_user_id), ''),
        (select 'Google ID：' || coalesce(nullif(btrim(i.provider_id), ''), nullif(btrim(i.identity_data->>'sub'), ''))
         from auth.identities i where i.user_id = m.auth_user_id and i.provider = 'google'
         order by i.created_at, i.id limit 1))) order by m.auth_user_id)
    from public.members m
    left join auth.users u on u.id = m.auth_user_id
    left join lateral (
      select coalesce(nullif(btrim(i.identity_data->>'name'), ''), nullif(btrim(i.identity_data->>'full_name'), '')) as name
      from auth.identities i
      where i.user_id = m.auth_user_id
        and coalesce(nullif(btrim(i.identity_data->>'name'), ''), nullif(btrim(i.identity_data->>'full_name'), '')) is not null
      order by i.created_at, i.id limit 1
    ) identity_name on true
    where m.auth_user_id = any(p_auth_user_ids)
  ), '[]'::jsonb);
end;
$$;
revoke all on function public.admin_push_log_member_names(uuid[]) from public, anon, authenticated;
grant execute on function public.admin_push_log_member_names(uuid[]) to service_role;
