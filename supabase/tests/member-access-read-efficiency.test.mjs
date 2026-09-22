import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { after, before, test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
const migrationUrl = new URL('../migrations/20260922110000_optimize_member_access_reads.sql', import.meta.url);
const activeUser = '00000000-0000-4000-8000-000000000001';
const inactiveUser = '00000000-0000-4000-8000-000000000002';
const monthlyPlan = '10000000-0000-4000-8000-000000000001';

async function asUser(id) {
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id]);
}

async function definition(signature) {
  return (await db.query('select pg_get_functiondef($1::regprocedure) as definition', [signature])).rows[0].definition;
}

before(async () => {
  await db.exec(`
    create schema auth;
    create schema private;
    create role anon;
    create role authenticated;
    create role service_role;

    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
    $$;

    create table public.plans (
      id uuid primary key,
      name text not null
    );
    create table public.members (
      id uuid primary key,
      auth_user_id uuid unique not null,
      line_user_id text,
      status text not null default 'active',
      current_plan_id uuid references public.plans(id),
      is_lifetime boolean not null default false,
      plan_started_at timestamptz,
      plan_expires_at timestamptz,
      referral_code text,
      invitation_code text,
      line_trial_started_at timestamptz,
      last_online_at timestamptz,
      total_online_seconds integer not null default 0,
      online_session_count integer not null default 0
    );
    create table public.payments (
      id uuid default gen_random_uuid(),
      member_id uuid not null,
      status text not null
    );
    create table private.matrix_permission_settings (
      singleton boolean primary key,
      registered_member_free_access boolean not null default false
    );
    create table public.notification_settings (
      member_id uuid primary key,
      settings jsonb not null,
      updated_at timestamptz not null default now()
    );
    create table public.member_online_sessions (
      id uuid primary key default gen_random_uuid(),
      member_id uuid not null,
      started_at timestamptz not null,
      ended_at timestamptz,
      online_seconds integer
    );

    insert into public.plans values ('10000000-0000-4000-8000-000000000001', '月費方案');
    insert into public.members (
      id, auth_user_id, line_user_id, status, current_plan_id,
      plan_started_at, plan_expires_at
    ) values
      ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'line-active', 'active', '10000000-0000-4000-8000-000000000001', now() - interval '1 day', now() + interval '30 days'),
      ('00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000002', 'line-inactive', 'disabled', '10000000-0000-4000-8000-000000000001', now() - interval '1 day', now() + interval '30 days');
    insert into private.matrix_permission_settings values (true, false);

    create function private.member_login_perks_eligible(uuid, text)
    returns boolean language sql stable set search_path='' as $$ select false $$;

    create function private.default_member_notification_settings()
    returns jsonb language sql stable set search_path='' as $$
      select '{"settings":{},"selectedOptions":{},"betTimes":{},"statusOptions":{},"collisionOptions":{}}'::jsonb
    $$;

    create function private.active_member_id()
    returns uuid language plpgsql stable security definer set search_path='' as $$
    declare v_uid uuid := auth.uid(); v_member public.members%rowtype;
    begin
      if v_uid is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
      select * into v_member from public.members where auth_user_id=v_uid limit 1;
      if not found or coalesce(v_member.status,'') in ('停用','disabled','inactive') then
        raise exception using errcode='42501',message='FORBIDDEN';
      end if;
      return v_member.id;
    end $$;

    create function private.matrix_result_entitlements()
    returns jsonb language plpgsql stable security definer set search_path='' as $$
    declare
      v_uid uuid:=auth.uid(); v_member public.members%rowtype; v_plan text:='free';
      v_paid boolean:=false; v_free_access boolean:=false; v_referrals integer:=0;
      v_dow integer:=extract(isodow from timezone('Asia/Taipei',now()));
    begin
      if v_uid is not null then
        select * into v_member from public.members where auth_user_id=v_uid limit 1;
        if not found or coalesce(v_member.status,'') in ('停用','disabled','inactive') then
          raise exception using errcode='42501',message='FORBIDDEN';
        end if;
        select registered_member_free_access into v_free_access
        from private.matrix_permission_settings where singleton;
        v_free_access:=coalesce(v_free_access,false);
        if v_member.is_lifetime then v_plan:='lifetime';v_paid:=true;
        else
          select case p.name when '試用方案' then 'trial' when '月費方案' then 'monthly'
            when '季費方案' then 'quarterly' when '年費方案' then 'yearly' else 'free' end
          into v_plan from public.plans p where p.id=v_member.current_plan_id;
          v_plan:=coalesce(v_plan,'free');
          v_paid:=v_plan<>'free' and coalesce(v_member.plan_expires_at>now(),false);
        end if;
        if coalesce(v_member.referral_code,'')<>'' then
          select count(distinct invited.id)::integer into v_referrals
          from public.members invited where invited.invitation_code=v_member.referral_code
            and exists(select 1 from public.payments pay where pay.member_id=invited.id and pay.status='confirmed');
        end if;
      end if;
      return jsonb_build_object(
        'canUseSeven',v_free_access or v_paid or v_referrals>=15
          or (v_uid is not null and private.member_login_perks_eligible(v_uid,v_member.line_user_id) and v_dow in (2,5))
          or (v_referrals>=10 and v_dow in (1,4)),
        'canUseThirteen',v_free_access or v_paid,
        'canUseFullRange',v_free_access or v_paid or v_referrals>=50 or (v_referrals>=30 and v_dow in (2,5)),
        'canUseTianyan',v_free_access or (v_paid and v_plan in ('quarterly','yearly','lifetime'))
          or coalesce(v_member.line_trial_started_at<=now() and v_member.line_trial_started_at+interval '48 hours'>now(),false),
        'canUseTiangong',v_free_access or (v_paid and v_plan in ('yearly','lifetime'))
          or coalesce(v_member.line_trial_started_at<=now() and v_member.line_trial_started_at+interval '24 hours'>now(),false),
        'canViewFullStatus',v_paid
      );
    end $$;

    create function public.member_profile_20260829_impl()
    returns jsonb language plpgsql stable security definer set search_path='' as $$
    declare v_member_id uuid:=private.active_member_id();v_result jsonb;
    begin
      select jsonb_build_object(
        'memberId',m.id,'lineUserId',m.line_user_id,
        'planName',case when m.is_lifetime then '終身方案' else coalesce(p.name,'免費會員') end,
        'planExpiresAt',m.plan_expires_at,'isLifetime',m.is_lifetime
      ) into v_result
      from public.members m left join public.plans p on p.id=m.current_plan_id
      where m.id=v_member_id limit 1;
      if v_result is null then raise exception using errcode='42501',message='FORBIDDEN'; end if;
      return v_result;
    end $$;

    create function public.member_profile()
    returns jsonb language plpgsql stable security definer set search_path='' as $$
    begin
      perform private.active_member_id();
      return public.member_profile_20260829_impl()
        || jsonb_build_object('exploreEntitlements',private.matrix_result_entitlements());
    end $$;

    create function public.member_notification_settings_get_20260829_impl()
    returns jsonb language plpgsql stable security definer set search_path='' as $$
    declare v_uid uuid:=auth.uid();v_member_id uuid;v_settings jsonb;
    begin
      if v_uid is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
      select id into v_member_id from public.members where auth_user_id=v_uid limit 1;
      if v_member_id is null then raise exception using errcode='42501',message='FORBIDDEN'; end if;
      select settings into v_settings from public.notification_settings where member_id=v_member_id;
      return coalesce(v_settings,private.default_member_notification_settings())
        #- '{settings,win}' #- '{selectedOptions,win}';
    end $$;

    create function public.member_notification_settings_save_20260829_impl(p_settings jsonb)
    returns jsonb language plpgsql security definer set search_path='' as $$
    declare v_uid uuid:=auth.uid();v_member_id uuid;v_key_count integer;
    begin
      if v_uid is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
      select id into v_member_id from public.members where auth_user_id=v_uid limit 1;
      if v_member_id is null then raise exception using errcode='42501',message='FORBIDDEN'; end if;
      p_settings:=p_settings #- '{settings,win}' #- '{selectedOptions,win}';
      select count(*)::integer into v_key_count from jsonb_object_keys(p_settings);
      if jsonb_typeof(p_settings)<>'object' or v_key_count<>5
        or not (p_settings ?& array['settings','selectedOptions','betTimes','statusOptions','collisionOptions'])
        or jsonb_typeof(p_settings->'settings')<>'object'
        or jsonb_typeof(p_settings->'selectedOptions')<>'object'
        or jsonb_typeof(p_settings->'betTimes')<>'object'
        or jsonb_typeof(p_settings->'statusOptions')<>'object'
        or jsonb_typeof(p_settings->'collisionOptions')<>'object' then
        raise exception using errcode='22023',message='INVALID_NOTIFICATION_SETTINGS';
      end if;
      insert into public.notification_settings(member_id,settings,updated_at)
      values(v_member_id,p_settings,now())
      on conflict(member_id) do update set settings=excluded.settings,updated_at=excluded.updated_at;
      return p_settings;
    exception when data_exception then
      raise exception using errcode='22023',message='INVALID_NOTIFICATION_SETTINGS';
    end $$;

    create function public.member_notification_settings_get()
    returns jsonb language plpgsql stable security definer set search_path='' as $$
    begin perform private.active_member_id();return public.member_notification_settings_get_20260829_impl();end $$;
    create function public.member_notification_settings_save(p_settings jsonb)
    returns jsonb language plpgsql security definer set search_path='' as $$
    begin perform private.active_member_id();return public.member_notification_settings_save_20260829_impl(p_settings);end $$;

    create function public.member_online_start_20260829_impl()
    returns jsonb language plpgsql security definer set search_path='' as $$
    declare v_uid uuid:=auth.uid();v_member_id uuid;v_session_id uuid;v_now timestamptz:=now();
    begin
      if v_uid is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
      select id into v_member_id from public.members where auth_user_id=v_uid limit 1;
      if v_member_id is null then raise exception using errcode='42501',message='FORBIDDEN'; end if;
      insert into public.member_online_sessions(member_id,started_at) values(v_member_id,v_now) returning id into v_session_id;
      update public.members set last_online_at=v_now where id=v_member_id;
      return jsonb_build_object('sessionId',v_session_id);
    end $$;

    create function public.member_online_end_20260829_impl(p_session_id uuid)
    returns jsonb language plpgsql security definer set search_path='' as $$
    declare
      v_uid uuid:=auth.uid();v_member_id uuid;v_started_at timestamptz;
      v_existing_seconds integer;v_online_seconds integer;v_now timestamptz:=now();
    begin
      if v_uid is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
      select id into v_member_id from public.members where auth_user_id=v_uid limit 1;
      if v_member_id is null then raise exception using errcode='42501',message='FORBIDDEN'; end if;
      select started_at,online_seconds into v_started_at,v_existing_seconds
      from public.member_online_sessions where id=p_session_id and member_id=v_member_id for update;
      if not found then raise exception using errcode='22023',message='MEMBER_ONLINE_SESSION_NOT_FOUND'; end if;
      if v_existing_seconds is not null then return jsonb_build_object('onlineSeconds',v_existing_seconds); end if;
      v_online_seconds:=greatest(0,floor(extract(epoch from v_now-v_started_at))::integer);
      update public.member_online_sessions set ended_at=v_now,online_seconds=v_online_seconds where id=p_session_id;
      update public.members set last_online_at=v_now,total_online_seconds=total_online_seconds+v_online_seconds,
        online_session_count=online_session_count+1 where id=v_member_id;
      return jsonb_build_object('onlineSeconds',v_online_seconds);
    end $$;

    create function public.member_online_start()
    returns jsonb language plpgsql security definer set search_path='' as $$
    begin perform private.active_member_id();return public.member_online_start_20260829_impl();end $$;
    create function public.member_online_end(p_session_id uuid)
    returns jsonb language plpgsql security definer set search_path='' as $$
    begin perform private.active_member_id();return public.member_online_end_20260829_impl(p_session_id);end $$;

    revoke all on function public.member_profile_20260829_impl() from public,anon,authenticated;
    revoke all on function public.member_notification_settings_get_20260829_impl() from public,anon,authenticated;
    revoke all on function public.member_notification_settings_save_20260829_impl(jsonb) from public,anon,authenticated;
    revoke all on function public.member_online_start_20260829_impl() from public,anon,authenticated;
    revoke all on function public.member_online_end_20260829_impl(uuid) from public,anon,authenticated;
    grant execute on function public.member_profile() to authenticated;
    grant execute on function public.member_notification_settings_get() to authenticated;
    grant execute on function public.member_notification_settings_save(jsonb) to authenticated;
    grant execute on function public.member_online_start() to authenticated;
    grant execute on function public.member_online_end(uuid) to authenticated;
  `);

  if (existsSync(fileURLToPath(migrationUrl))) {
    await db.exec(readFileSync(migrationUrl, 'utf8'));
  }
});
after(async () => db.close());

test('member profile uses one active member snapshot instead of delegating through the legacy profile', async () => {
  const source = await definition('public.member_profile()');
  assert.doesNotMatch(source, /member_profile_20260829_impl|matrix_result_entitlements\(\)/);
  assert.match(source, /matrix_result_entitlements_for_member/);

  await asUser(activeUser);
  const profile = (await db.query('select public.member_profile() profile')).rows[0].profile;
  assert.deepEqual(profile, {
    memberId: activeUser,
    lineUserId: 'line-active',
    planName: '月費方案',
    planExpiresAt: profile.planExpiresAt,
    isLifetime: false,
    exploreEntitlements: {
      canUseSeven: true,
      canUseThirteen: true,
      canUseFullRange: true,
      canUseTianyan: false,
      canUseTiangong: false,
      canViewFullStatus: true,
    },
  });
});

test('notification wrappers use the already resolved active member id', async () => {
  assert.doesNotMatch(await definition('public.member_notification_settings_get()'), /_20260829_impl/);
  assert.doesNotMatch(await definition('public.member_notification_settings_save(jsonb)'), /_20260829_impl/);

  await asUser(activeUser);
  const settings = { settings: { bet: true }, selectedOptions: {}, betTimes: {}, statusOptions: {}, collisionOptions: {} };
  const saved = (await db.query('select public.member_notification_settings_save($1::jsonb) value', [JSON.stringify(settings)])).rows[0].value;
  const read = (await db.query('select public.member_notification_settings_get() value')).rows[0].value;
  assert.deepEqual(saved, settings);
  assert.deepEqual(read, settings);
});

test('online tracking wrappers use the already resolved active member id', async () => {
  assert.doesNotMatch(await definition('public.member_online_start()'), /_20260829_impl/);
  assert.doesNotMatch(await definition('public.member_online_end(uuid)'), /_20260829_impl/);

  await asUser(activeUser);
  const started = (await db.query('select public.member_online_start() value')).rows[0].value;
  assert.ok(started.sessionId);
  const ended = (await db.query('select public.member_online_end($1::uuid) value', [started.sessionId])).rows[0].value;
  assert.equal(typeof ended.onlineSeconds, 'number');
  const member = (await db.query('select online_session_count from public.members where id=$1', [activeUser])).rows[0];
  assert.equal(member.online_session_count, 1);
});

test('optimized wrappers preserve inactive-member denial', async () => {
  await asUser(inactiveUser);
  await assert.rejects(() => db.query('select public.member_profile()'), /FORBIDDEN/);
  await assert.rejects(() => db.query('select public.member_notification_settings_get()'), /FORBIDDEN/);
  await assert.rejects(() => db.query('select public.member_online_start()'), /FORBIDDEN/);
});

test('private access helpers remain unavailable to browser roles', async () => {
  const privileges = (await db.query(`select
    has_function_privilege('anon','private.active_member_record()','EXECUTE') as anon_record,
    has_function_privilege('authenticated','private.matrix_result_entitlements_for_member(public.members,text)','EXECUTE') as member_entitlements,
    has_function_privilege('service_role','private.member_notification_settings_get_for_member(uuid)','EXECUTE') as service_notification
  `)).rows[0];
  assert.deepEqual(privileges, {
    anon_record: false,
    member_entitlements: false,
    service_notification: false,
  });
});
