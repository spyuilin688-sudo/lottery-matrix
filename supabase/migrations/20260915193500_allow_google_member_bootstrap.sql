create or replace function public.member_bootstrap_20260829_impl()
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_line_user_id text;
  v_member public.members%rowtype;
begin
  if v_uid is null then
    raise exception using errcode = '42501', message = 'AUTH_REQUIRED';
  end if;

  select nullif(pg_catalog.btrim(identity.provider_id), '')
    into v_line_user_id
  from auth.identities as identity
  where identity.user_id = v_uid
    and identity.provider = 'custom:line'
  order by identity.created_at
  limit 1;

  if v_line_user_id is not null and exists (
    select 1 from public.members
    where line_user_id = v_line_user_id and auth_user_id <> v_uid
  ) then
    raise exception using errcode = '23505', message = 'LINE_IDENTITY_CONFLICT';
  end if;

  insert into public.members (auth_user_id, line_user_id)
  values (v_uid, v_line_user_id)
  on conflict (auth_user_id) do update
    set line_user_id = excluded.line_user_id
    where public.members.line_user_id is null
      and excluded.line_user_id is not null;

  select * into v_member
  from public.members
  where auth_user_id = v_uid
  limit 1;

  if not found then
    raise exception using errcode = '23505', message = 'MEMBER_BOOTSTRAP_FAILED';
  end if;

  if v_line_user_id is not null and v_member.line_user_id is distinct from v_line_user_id then
    raise exception using errcode = '23505', message = 'LINE_IDENTITY_CONFLICT';
  end if;

  return pg_catalog.jsonb_build_object(
    'memberId', v_member.id,
    'lineUserId', v_member.line_user_id
  );
exception
  when unique_violation then
    raise exception using errcode = '23505', message = 'LINE_IDENTITY_CONFLICT';
end;
$function$;
