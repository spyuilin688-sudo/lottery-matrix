import { afterEach, beforeEach, expect, it } from 'vitest';
// @ts-expect-error Node fixture deliberately shared with SQL contract tests.
import { createAppDb, applyAppMigrations, identity, asUser, rpc, pwaSnapshot } from '../../../tests/helpers/app-db.mjs';
let db: Awaited<ReturnType<typeof createAppDb>>;
const owner = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
beforeEach(async () => {
  db = await createAppDb();
  await db.exec(`create table public.admin_accounts(id uuid primary key,account text,role text,status text);
    insert into public.admin_accounts values('${owner}','spyuilin688@gmail.com','超級管理員','啟用'),('${other}','other@example.com','超級管理員','啟用');`);
  await applyAppMigrations(db, ['app_admin_operations']);
});
afterEach(async () => { await db?.close(); });
it('rechecks owner in DB and changes App revision atomically, never PWA membership', async () => {
  const who = await identity(db);
  const member = await asUser(db, who, () => rpc(db, 'app_member_bootstrap'));
  await asUser(db, who, () => rpc(db, 'member_bootstrap'));
  const before = await pwaSnapshot(db);
  await expect(rpc(db, 'app_admin_set_status', [other, member.memberId, 'disabled', 1])).rejects.toThrow('APP_ADMIN_FORBIDDEN');
  const result = await rpc(db, 'app_admin_set_status', [owner, member.memberId, 'disabled', 1]);
  expect(result).toMatchObject({ status: 'disabled', entitlementRevision: 2 });
  await expect(rpc(db, 'app_admin_set_status', [owner, member.memberId, 'active', 1])).rejects.toThrow('APP_REVISION_CONFLICT');
  const pwaId = (await db.query('select id from public.members')).rows[0].id;
  await expect(rpc(db, 'app_admin_set_status', [owner, pwaId, 'disabled', 1])).rejects.toThrow('APP_MEMBER_NOT_FOUND');
  expect(await pwaSnapshot(db)).toEqual(before);
  const page = await rpc(db, 'app_admin_list', [owner, 'subscriptions', 1, 25, '']);
  expect(page.total).toBe(1);
  expect(page.items[0]).toMatchObject({ id: member.memberId, entitlementSource: 'free_launch' });
  await expect(asUser(db, who, () => rpc(db, 'app_admin_revenue', [owner]))).rejects.toThrow('permission denied');
});
it('returns actual zero, groups all revenue by currency, rejects duplicated source events', async () => {
  expect(await rpc(db, 'app_admin_revenue', [owner])).toEqual({ transactionCount: 0, totalsByCurrency: [] });
  await db.exec(`insert into public.app_revenue_entries(source_event_id,currency,gross_minor,occurred_at) values
    ('one','TWD',100,now()),('two','USD',200,now()),('three','TWD',-25,now());`);
  expect(await rpc(db, 'app_admin_revenue', [owner])).toEqual({ transactionCount: 3, totalsByCurrency: [{ currency: 'TWD', grossMinor: 75 }, { currency: 'USD', grossMinor: 200 }] });
  await expect(db.exec("insert into public.app_revenue_entries(source_event_id,currency,gross_minor,occurred_at) values('one','TWD',100,now())")).rejects.toThrow('duplicate key');
});
