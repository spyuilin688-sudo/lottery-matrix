import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
const migration = name => readFile(new URL(`../supabase/migrations/${name}.sql`, import.meta.url), 'utf8');
const uid = '00000000-0000-0000-0000-000000000001';
const mid = '10000000-0000-0000-0000-000000000001';
const other = '10000000-0000-0000-0000-000000000002';
const query = async (sql, args) => (await db.query(sql, args)).rows;
const asMember = () => db.exec(`set role authenticated; set request.jwt.claim.sub = '${uid}';`);
const asOwner = () => db.exec('reset role;');

before(async () => {
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create schema private; create schema extensions;
    alter default privileges grant execute on functions to service_role;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth, public to anon, authenticated, service_role;
    grant execute on function auth.uid() to anon, authenticated, service_role;
  `);
  // Real historical definitions, restricted to this migration's dependencies.
  for (const name of [
    '20260813174647_admin_dashboard',
    '20260813175127_admin_dashboard_advisor_fixes',
    '20260821005644_matrix_custom_status_configs',
    '20260821011026_matrix_custom_status_admin_read',
    '20260821212800_matrix_custom_status_api_only_mutations',
    '20260905114917_consolidate_matrix_custom_status_select_policy',
  ]) await db.exec(await migration(name));
  const transfer = await migration('20260830060000_manual_bank_transfer');
  await db.exec(transfer.slice(0, transfer.indexOf('create or replace function public.member_pending_transfer_request')) + 'commit;');
  await db.exec(await migration('20260902213221_activation_code_generation_rules'));
  await db.exec(`
    create table public.admin_accounts(id uuid primary key, name text, status text, role text default '營運管理員');
  `);
  await db.exec(await migration('20260903042000_admin_credential_login_schema'));
  await db.exec(await migration('20260821194500_protect_last_super_admin'));
  await db.exec(await migration('20260904050000_normalize_manual_transfer_review'));
  await db.exec(`
    grant all on all tables in schema public to service_role;
    grant execute on function public.member_transfer_request_submit(text,text) to authenticated;
    insert into auth.users values ('${uid}'), ('00000000-0000-0000-0000-000000000002');
    insert into members(id,auth_user_id,status,plan_expires_at) values
      ('${mid}','${uid}','啟用',now()+interval '10 days'),
      ('${other}','00000000-0000-0000-0000-000000000002','啟用',now()+interval '10 days');
    insert into admin_profiles(user_id) values ('${uid}');
    insert into matrix_custom_status_configs(member_id,lottery,status,config)
      select id,'今彩539','ACTIVE','{"lottery":"今彩539","status":"ACTIVE","explorePeriods":13,"exploreRange":"完整範圍","oneCodeGroups":[],"twoCodeGroups":[]}'::jsonb from members;
    insert into admin_accounts(id,name,status,password_hash,password_salt) values
      ('${mid}','first','啟用','hash','salt'), ('${other}','second','啟用','other','salt');
    insert into admin_sessions(token_hash,admin_id,expires_at) values
      ('old-a','${mid}',now()+interval '1 day'), ('old-b','${mid}',now()+interval '1 day'), ('other','${other}',now()+interval '1 day');
    insert into activation_code_batches(id,duration_type,created_at,expires_at) values
      ('20000000-0000-0000-0000-000000000001','30_days',now(),now()+interval '1 month');
    insert into activation_codes(batch_id,code,duration_type,created_at,expires_at) values
      ('20000000-0000-0000-0000-000000000001','AAAA-BBBB-CCCC-DDDD','30_days',now(),now()+interval '1 month');
  `);
  await db.exec(await migration('20260908153522_member_admin_revocation'));
});
after(async () => { await db.close(); });

test('disabled member cannot redeem a valid code or submit a transfer; neither has side effects', async () => {
  for (const status of ['停用','disabled','inactive']) {
    await asOwner(); await db.query('update members set status=$1 where id=$2', [status, mid]); await asMember();
    await assert.rejects(db.query("select public.redeem_activation_code('AAAA-BBBB-CCCC-DDDD')"), /FORBIDDEN/);
    await assert.rejects(db.query("select public.member_transfer_request_submit('month','12345')"), /FORBIDDEN/);
  }
  await asOwner();
  assert.equal((await query('select count(*)::int as count from transfer_requests'))[0].count, 0);
  assert.equal((await query('select status from activation_codes'))[0].status, 'unused');
});

test('enabled member retains normal redemption, plan extension, transfer price, and duplicate protection', async () => {
  await asOwner(); await db.query("update members set status='啟用' where id=$1", [mid]);
  const expiry = (await query('select plan_expires_at from members where id=$1',[mid]))[0].plan_expires_at;
  await asMember();
  const redemption = (await query("select public.redeem_activation_code('AAAA-BBBB-CCCC-DDDD') as result"))[0].result;
  assert.equal(redemption.member_id, mid);
  assert.ok(new Date(redemption.plan_expires_at).getTime() > new Date(expiry).getTime());
  await assert.rejects(db.query("select public.redeem_activation_code('AAAA-BBBB-CCCC-DDDD')"), /ACTIVATION_CODE_ALREADY_USED/);
  const transfer = (await query("select public.member_transfer_request_submit('month','12345') as result"))[0].result;
  assert.equal(transfer.amount, 1880); assert.equal(transfer.accountLastFive, '12345');
  await assert.rejects(db.query("select public.member_transfer_request_submit('month','54321')"), /PENDING_TRANSFER_EXISTS/);
});

test('password updates revoke every session for that account atomically, including salt-only changes', async () => {
  await asOwner();
  await db.query("update admin_accounts set password_hash='new' where id=$1",[mid]);
  assert.deepEqual(await query('select token_hash from admin_sessions order by token_hash'), [{token_hash:'other'}]);
  assert.equal((await query('select credential_version from admin_accounts where id=$1',[mid]))[0].credential_version,1);
  await db.query("insert into admin_sessions(token_hash,admin_id,credential_version,expires_at) values ('fresh',$1,1,now()+interval '1 day')",[mid]);
  await db.query("update admin_accounts set name='renamed' where id=$1",[mid]);
  assert.equal((await query("select count(*)::int as count from admin_sessions where token_hash='fresh'"))[0].count,1);
  await db.exec('begin;');
  await db.query("update admin_accounts set password_salt='new-salt' where id=$1",[mid]);
  assert.equal((await query("select count(*)::int as count from admin_sessions where token_hash='fresh'"))[0].count,0);
  await db.exec('rollback;');
  assert.equal((await query("select count(*)::int as count from admin_sessions where token_hash='fresh'"))[0].count,1);
  await db.query("update admin_accounts set password_salt='new-salt' where id=$1",[mid]);
  assert.equal((await query('select credential_version from admin_accounts where id=$1',[mid]))[0].credential_version,2);
});

test('legacy admin JWT loses admin privileges but retains its own member and custom-settings reads', async () => {
  await asMember();
  assert.deepEqual(await query('select id from members'), [{id:mid}]);
  assert.deepEqual(await query('select member_id from matrix_custom_status_configs'), [{member_id:mid}]);
  assert.deepEqual(await query('select id from activation_codes'), []);
  await assert.rejects(db.query('select * from admin_profiles'), /permission denied/);
  await assert.rejects(db.query('select public.admin_dashboard_stats()'), /permission denied/);
  await assert.rejects(db.query('select public.is_admin()'), /permission denied/);
  await assert.rejects(db.query("select private.redeem_activation_code('AAAA-BBBB-CCCC-DDDD')"), /permission denied/);
  await db.exec('reset role; set role service_role;');
  assert.equal((await query('select count(*)::int as count from members'))[0].count,2);
  await asOwner();
  assert.equal((await query("select has_function_privilege('service_role','public.generate_activation_code_batch(text,integer)','execute') as allowed"))[0].allowed,true);
});

test('only authenticated public financial entry points retain execution rights', async () => {
  await asOwner();
  for (const role of ['anon','authenticated','service_role']) {
    for (const signature of ['redeem_activation_code(text)','member_transfer_request_submit(text,text)']) {
      const allowed=(await query("select has_function_privilege($1,$2,'execute') as allowed",[role,'public.'+signature]))[0].allowed;
      assert.equal(allowed,role==='authenticated');
      assert.equal((await query("select has_function_privilege($1,$2,'execute') as allowed",[role,'private.'+signature]))[0].allowed,false);
    }
  }
  assert.equal((await query("select has_function_privilege('service_role','public.admin_review_transfer_request(uuid,text,timestamptz,uuid,text)','execute') as allowed"))[0].allowed,true);
});

test('last-super-admin protection rolls back password and session changes together', async () => {
  await asOwner();
  await db.query("update admin_accounts set role='超級管理員' where id=$1",[other]);
  await db.exec('set role service_role;');
  await db.query("update admin_accounts set password_hash='super-new' where id=$1",[other]);
  assert.equal((await query('select credential_version from admin_accounts where id=$1',[other]))[0].credential_version,1);
  await db.query("insert into admin_sessions(token_hash,admin_id,credential_version,expires_at) values ('super-fresh',$1,1,now()+interval '1 day')",[other]);
  await assert.rejects(db.query("update admin_accounts set password_hash='rejected',status='停用' where id=$1",[other]),/系統必須保留/);
  assert.equal((await query('select password_hash from admin_accounts where id=$1',[other]))[0].password_hash,'super-new');
  assert.equal((await query('select credential_version from admin_accounts where id=$1',[other]))[0].credential_version,1);
  assert.equal((await query("select count(*)::int as count from admin_sessions where token_hash='super-fresh'"))[0].count,1);
});

