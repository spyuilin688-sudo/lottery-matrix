import { PGlite } from '@electric-sql/pglite';
import { existsSync, readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAdminData } from './admin-data';

const migration = new URL('../../../supabase/migrations/20260921065627_admin_account_revision.sql', import.meta.url);
const actor = { id: 'owner', account: 'owner', name: 'Owner', role: '超級管理員' };
const input = { account: 'operator', name: 'Changed name', role: '營運管理員', status: '啟用', can_view: true, can_add: true, can_edit: true, can_delete: true, expectedRevision: 0 };

describe('administrator edits use database compare-and-swap', () => {
  let db: PGlite;
  beforeEach(async () => {
    db = new PGlite();
    await db.exec(`create schema private; create role anon; create role authenticated; create role service_role;
      create table public.admin_accounts (id text primary key, account text, name text, role text, status text,
        can_view boolean, can_add boolean, can_edit boolean, can_delete boolean);
      insert into public.admin_accounts values ('operator', 'operator', 'Operator', '營運管理員', '啟用', true, true, true, true);
      insert into public.admin_accounts values ('owner', 'owner', 'Owner', '超級管理員', '啟用', true, true, true, true);`);
    await db.exec(readFileSync(new URL('../../../supabase/migrations/20260821194500_protect_last_super_admin.sql', import.meta.url), 'utf8'));
    if (existsSync(migration)) await db.exec(readFileSync(migration, 'utf8'));
  });
  afterEach(async () => { await db.close(); });

  function service(afterRead?: () => Promise<void>) {
    const audit = vi.fn(async () => []);
    const data = createAdminData({
      selectRows: async (_table, query) => {
        const params = new URLSearchParams(query);
        const id = params.get('id')?.slice(3);
        const result = id ? await db.query('select * from admin_accounts where id = $1', [id])
          : await db.query("select id from admin_accounts where role = '超級管理員' and status = '啟用'");
        if (id) await afterRead?.();
        return result.rows as never[];
      },
      updateRows: async (_table, query, record) => {
        const params = new URLSearchParams(query);
        const values = Object.values(record as object);
        const sets = Object.keys(record as object).map((key, i) => `${key} = $${i + 1}`);
        values.push(params.get('id')!.slice(3));
        let where = `id = $${values.length}`;
        if (params.has('revision')) { values.push(Number(params.get('revision')!.slice(3))); where += ` and revision = $${values.length}`; }
        return (await db.query(`update admin_accounts set ${sets.join(',')} where ${where} returning *`, values)).rows as never[];
      },
      insertRows: audit, deleteRows: vi.fn(), supabaseRequest: vi.fn(),
    });
    return { data, audit };
  }

  it('rejects a stale name edit after another administrator disables the account and revokes permissions', async () => {
    await db.exec("update admin_accounts set status = '停用', can_edit = false, can_delete = false where id = 'operator'");
    const { data, audit } = service();
    await expect(data.updateAdminAccount('operator', input, actor)).rejects.toMatchObject({ statusCode: 409 });
    expect((await db.query("select name,status,can_edit,can_delete from admin_accounts where id='operator'")).rows[0])
      .toEqual({ name: 'Operator', status: '停用', can_edit: false, can_delete: false });
    expect(audit).not.toHaveBeenCalled();
  });

  it('rejects a write when the account changes after the server read', async () => {
    const { data } = service(async () => { await db.exec("update admin_accounts set status = '停用' where id = 'operator'"); });
    await expect(data.updateAdminAccount('operator', input, actor)).rejects.toMatchObject({ statusCode: 409 });
    expect((await db.query("select status from admin_accounts where id='operator'")).rows[0]).toEqual({ status: '停用' });
  });

  it('returns a new revision after a fresh edit and rejects replaying its old revision', async () => {
    const { data } = service();
    await expect(data.updateAdminAccount('operator', input, actor)).resolves.toMatchObject({ name: 'Changed name', revision: 1 });
    await expect(data.updateAdminAccount('operator', input, actor)).rejects.toMatchObject({ statusCode: 409 });
  });

  it.each([undefined, -1, 0.5, '0', null])('rejects missing or invalid edit revision %s', async (expectedRevision) => {
    const { data } = service();
    await expect(data.updateAdminAccount('operator', { ...input, expectedRevision } as never, actor)).rejects.toMatchObject({ statusCode: 409 });
  });

  it('keeps the database last enabled super administrator safeguard', async () => {
    await expect(db.exec("update admin_accounts set status = '停用' where id = 'owner'"))
      .rejects.toThrow('系統必須保留至少一位啟用中的超級管理員');
  });
});
