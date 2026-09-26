import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const db = new PGlite();
const owner = '00000000-0000-4000-8000-000000000101';
const other = '00000000-0000-4000-8000-000000000102';

beforeAll(async () => {
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema private;
    create table public.admin_accounts (
      id uuid primary key, account text not null unique, name text not null,
      role text not null, status text not null, revision integer not null default 0,
      password_salt text, password_hash text
    );
    create function private.advance_admin_account_revision() returns trigger language plpgsql as $$
    begin new.revision := old.revision + 1; return new; end $$;
    create trigger advance_admin_account_revision before update on public.admin_accounts
      for each row execute function private.advance_admin_account_revision();
    insert into public.admin_accounts(id,account,name,role,status,password_salt,password_hash) values
      ('${owner}','spyuilin688@gmail.com','Owner','超級管理員','啟用','old-salt','old-hash'),
      ('${other}','other@example.com','Other','超級管理員','啟用','other-salt','other-hash');
    select pg_catalog.set_config('request.jwt.claims','{"role":"service_role"}',false);
  `);
  await db.exec(readFileSync(new URL('../../../supabase/migrations/20260926030507_20260926024552_protect_private_activation_owner_account.sql', import.meta.url), 'utf8'));
}, 20000);
afterAll(() => db.close());

describe('designated private activation owner identity', () => {
  it('rejects credential replacement, account reassignment, disabling and deletion even with database write access', async () => {
    await expect(db.query('update public.admin_accounts set password_hash=$2 where id=$1', [owner, 'taken-over']))
      .rejects.toMatchObject({ code: '42501' });
    await expect(db.query('update public.admin_accounts set account=$2 where id=$1', [other, 'SPYUILIN688@gmail.com']))
      .rejects.toMatchObject({ code: '42501' });
    await expect(db.query('update public.admin_accounts set role=$2 where id=$1', [owner, '查看人員']))
      .rejects.toMatchObject({ code: '42501' });
    await expect(db.query('update public.admin_accounts set status=$2 where id=$1', [owner, '停用']))
      .rejects.toMatchObject({ code: '42501' });
    await expect(db.query('delete from public.admin_accounts where id=$1', [owner]))
      .rejects.toMatchObject({ code: '42501' });
    expect((await db.query('select account,role,status,password_hash from public.admin_accounts where id=$1', [owner])).rows)
      .toEqual([{ account: 'spyuilin688@gmail.com', role: '超級管理員', status: '啟用', password_hash: 'old-hash' }]);
  });

  it('lets the designated administrator change their own password only through the guarded operation', async () => {
    await expect(db.query('select public.admin_update_private_activation_owner_password($1,$2,$3,$4,$5)',
      [other, 0, 'Owner', 'new-salt', 'new-hash'])).rejects.toMatchObject({ code: '42501' });
    await expect(db.query('select public.admin_update_private_activation_owner_password($1,$2,$3,$4,$5)',
      [owner, 0, 'Owner', 'new-salt', 'new-hash'])).resolves.toMatchObject({ rows: [expect.any(Object)] });
    expect((await db.query('select password_hash from public.admin_accounts where id=$1', [owner])).rows)
      .toEqual([{ password_hash: 'new-hash' }]);
    await expect(db.query('update public.admin_accounts set password_hash=$2 where id=$1', [owner, 'direct-takeover']))
      .rejects.toMatchObject({ code: '42501' });
    await expect(db.query('select public.admin_update_private_activation_owner_password($1,$2,$3,$4,$5)',
      [owner, 0, 'Owner', 'another-salt', 'another-hash'])).rejects.toMatchObject({ code: 'PT409' });
    expect((await db.query('select password_hash from public.admin_accounts where id=$1', [other])).rows)
      .toEqual([{ password_hash: 'other-hash' }]);
  });

  it('retains normal super administrator management of unrelated accounts and does not expose the guard to members', async () => {
    await db.query('update public.admin_accounts set name=$2 where id=$1', [other, 'Updated']);
    await db.query('update public.admin_accounts set name=$2 where id=$1', [owner, 'New Owner Name']);
    expect((await db.query('select name from public.admin_accounts where id=$1', [other])).rows).toEqual([{ name: 'Updated' }]);
    expect((await db.query('select name from public.admin_accounts where id=$1', [owner])).rows).toEqual([{ name: 'New Owner Name' }]);
    expect((await db.query("select has_table_privilege('authenticated','private.private_activation_owner_guard','select') as allowed")).rows)
      .toEqual([{ allowed: false }]);
    expect((await db.query("select has_function_privilege('authenticated','public.admin_update_private_activation_owner_password(uuid,integer,text,text,text)','execute') as allowed")).rows)
      .toEqual([{ allowed: false }]);
  });
});
