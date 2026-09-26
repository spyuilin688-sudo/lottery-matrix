-- Deletion and product bootstrap share the same identity lock. Auth cleanup is a
-- separate, retryable API operation, guarded again at the actual DELETE boundary.
create function private.app_auth_identity_in_use(p_uid uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare v_fk record; v_exists boolean; v_email text;
begin
  select email into v_email from auth.users where id=p_uid;
  if lower(coalesce(v_email,''))='spyuilin688@gmail.com' or exists (
    select 1 from public.admin_accounts where lower(btrim(account))=lower(v_email)
  ) then return true; end if;
  -- Unknown/unclassified Auth sessions may belong to another product. Never
  -- assume they are App sessions merely because they share an Auth user.
  if exists(select 1 from auth.sessions where user_id=p_uid) then return true; end if;
  for v_fk in
    select n.nspname schema_name,c.relname table_name,a.attname column_name,array_length(k.conkey,1) key_count
    from pg_catalog.pg_constraint k join pg_catalog.pg_class c on c.oid=k.conrelid
    join pg_catalog.pg_namespace n on n.oid=c.relnamespace
    join pg_catalog.pg_attribute a on a.attrelid=c.oid and a.attnum=k.conkey[1]
    where k.contype='f' and k.confrelid='auth.users'::regclass and n.nspname<>'auth'
      and k.conrelid<>'private.product_identity_lifecycle'::regclass
  loop
    -- Composite or new dependencies are retained conservatively.
    if v_fk.key_count<>1 then return true; end if;
    execute format('select exists(select 1 from %I.%I where %I=$1)',v_fk.schema_name,v_fk.table_name,v_fk.column_name) into v_exists using p_uid;
    if v_exists then return true; end if;
  end loop;
  return false;
end;
$$;
revoke all on function private.app_auth_identity_in_use(uuid) from public,anon,authenticated;

create function public.app_account_deletion_begin(p_user_id uuid,p_session_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_job uuid; v_keep boolean;
begin
  if p_user_id is null or not exists(select 1 from auth.sessions where id=p_session_id and user_id=p_user_id and (not_after is null or not_after>now()))
  then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text,9142026));
  insert into private.product_identity_lifecycle(auth_user_id) values(p_user_id) on conflict do nothing;
  select coalesce(deletion_id,gen_random_uuid()) into v_job from private.product_identity_lifecycle where auth_user_id=p_user_id for update;
  -- A verified deletion session is explicit App use, including a browser-only
  -- deletion entry or fresh authentication to retry pending cleanup.
  insert into public.member_login_records(id,auth_user_id,login_at,login_ip,last_connection_ip,last_connection_at)
    select id,user_id,coalesce(created_at,now()),ip,ip,coalesce(updated_at,created_at,now()) from auth.sessions where id=p_session_id on conflict do nothing;
  insert into private.product_session_usage(session_id,product) values(p_session_id,'app') on conflict do nothing;
  delete from private.app_native_legacy_receipts where installation_id in (
    select installation_id from private.app_native_installation_upgrades where auth_user_id=p_user_id
    union select installation_id from private.app_native_push_devices where member_id in(select id from public.app_members where auth_user_id=p_user_id)
  );
  delete from private.app_native_installation_upgrades where auth_user_id=p_user_id;
  -- Cascades remove App rights, subscriptions, preferences, online records,
  -- device tokens, queued deliveries/outbox and per-member App audit records.
  delete from public.app_members where auth_user_id=p_user_id;
  delete from auth.sessions s where s.user_id=p_user_id
    and exists(select 1 from private.product_session_usage u where u.session_id=s.id and u.product='app')
    and not exists(select 1 from private.product_session_usage u where u.session_id=s.id and u.product='pwa');
  delete from public.member_login_records r where r.auth_user_id=p_user_id
    and exists(select 1 from private.product_session_usage u where u.session_id=r.id and u.product='app')
    and not exists(select 1 from private.product_session_usage u where u.session_id=r.id and u.product='pwa');
  delete from private.product_session_usage u using public.member_login_records r
    where u.session_id=r.id and r.auth_user_id=p_user_id and u.product='app';
  v_keep:=private.app_auth_identity_in_use(p_user_id);
  update private.product_identity_lifecycle set app_deleted_at=coalesce(app_deleted_at,now()),deletion_id=v_job,
    auth_cleanup_state=case when v_keep then 'idle' else 'pending' end where auth_user_id=p_user_id;
  return jsonb_build_object('deletionId',v_job,'status',case when v_keep then 'completed' else 'pending' end,
    'authIdentity',case when v_keep then 'retained' else 'pending' end);
end;
$$;

create function public.app_account_deletion_finalize(p_user_id uuid,p_deletion_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_state text;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text,9142026));
  if not exists(select 1 from auth.users where id=p_user_id) then
    return jsonb_build_object('status','completed','authIdentity','deleted');
  end if;
  select auth_cleanup_state into v_state from private.product_identity_lifecycle where auth_user_id=p_user_id and deletion_id=p_deletion_id and app_deleted_at is not null;
  if not found then raise exception using errcode='42501',message='APP_DELETION_JOB_INVALID'; end if;
  return jsonb_build_object('status',case when v_state='pending' then 'pending' else 'completed' end,
    'authIdentity',case when v_state='pending' then 'pending' else 'retained' end);
end;
$$;
create function private.guard_app_auth_deletion() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if exists(select 1 from private.product_identity_lifecycle where auth_user_id=old.id and auth_cleanup_state='pending') then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(old.id::text,9142026));
    if private.app_auth_identity_in_use(old.id) then raise exception using errcode='42501',message='APP_AUTH_IDENTITY_IN_USE'; end if;
  end if;
  return old;
end;
$$;
revoke all on function private.guard_app_auth_deletion() from public,anon,authenticated;
create trigger guard_app_auth_deletion before delete on auth.users for each row execute function private.guard_app_auth_deletion();
revoke all on function public.app_account_deletion_begin(uuid,uuid),public.app_account_deletion_finalize(uuid,uuid) from public,anon,authenticated;
grant execute on function public.app_account_deletion_begin(uuid,uuid),public.app_account_deletion_finalize(uuid,uuid) to service_role;
