import { readFileSync, readdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { expect, it } from 'vitest';

it('keeps visibility separate from review access and restricts writes to super administrators', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create schema private; create schema auth;
      create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
      create table auth.users(id uuid primary key, raw_app_meta_data jsonb);
      create table public.members(auth_user_id uuid, is_lifetime boolean, status text);
      create table public.admin_accounts(id uuid primary key, status text, role text);
      create table private.matrix_permission_settings(singleton boolean primary key, subscription_purchase_visible boolean, registered_member_free_access boolean, revision int, updated_at timestamptz);
      insert into private.matrix_permission_settings values(true, false, false, 0, now());
      insert into auth.users values('11111111-1111-4111-8111-111111111111','{"ecpay_review":true}');
      insert into public.members values('11111111-1111-4111-8111-111111111111',true,'啟用');
      insert into public.admin_accounts values('22222222-2222-4222-8222-222222222222','啟用','超級管理員');
      set test.uid = '11111111-1111-4111-8111-111111111111';
    `);
    const name = readdirSync('supabase/migrations').find(name => name.endsWith('_ecpay_review_login.sql'))!;
    await db.exec(readFileSync(`supabase/migrations/${name}`, 'utf8'));
    const access = async () => (await db.query<{ allowed: boolean }>('select public.ecpay_review_access() as allowed')).rows[0].allowed;
    expect(await access()).toBe(true);
    const update = `select public.admin_matrix_permission_settings_update('22222222-2222-4222-8222-222222222222', '{"key":"ecpayReviewLoginVisible","value":true,"expectedRevision":0}');`;
    await expect(db.exec(update)).rejects.toThrow('ADMIN_BACKEND_REQUIRED');
    await db.exec(`set request.jwt.claim.role = 'service_role';`);
    await db.exec(update);
    const settings = (await db.query<{ settings: Record<string, unknown> }>('select public.matrix_permission_settings() as settings')).rows[0].settings;
    expect(settings).toMatchObject({ ecpayReviewLoginVisible: true, registeredMemberFreeAccess: false, subscriptionPurchaseVisible: false, revision: 1 });
    await expect(db.exec(update)).rejects.toThrow('SETTINGS_CONFLICT');
    await db.exec(`update private.matrix_permission_settings set ecpay_review_login_visible=false;`);
    expect(await access()).toBe(true);
    await db.exec(`update public.members set status='停用';`);
    expect(await access()).toBe(false);
    await db.exec(`update public.members set status='啟用'; update auth.users set raw_app_meta_data='{}';`);
    expect(await access()).toBe(false);
    await db.exec(`set test.uid = '';`);
    expect(await access()).toBe(false);
  } finally { await db.close(); }
}, 30_000);
