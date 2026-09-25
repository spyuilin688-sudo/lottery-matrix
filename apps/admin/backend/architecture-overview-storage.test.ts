import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { expect, it } from 'vitest';

it('restricts subscription snapshots to the server and preserves unknown billing values', async () => {
  const db = new PGlite();
  try {
    await db.exec('create role anon; create role authenticated; create role service_role bypassrls;');
    await db.exec(readFileSync(new URL('../../../supabase/migrations/20260925204803_admin_architecture_subscriptions.sql', import.meta.url), 'utf8'));
    await db.exec('set role service_role');
    const rows = await db.query('select * from public.admin_architecture_subscriptions');
    expect(rows.rows).toHaveLength(4);
    expect(rows.rows.every((row: any) => row.plan === null && row.fee === null && row.renewal_date === null)).toBe(true);
    await expect(db.exec("update public.admin_architecture_subscriptions set plan='Pro' where provider='railway'")).rejects.toThrow();
    await db.exec("update public.admin_architecture_subscriptions set plan='Pro', verified_at=now() where provider='railway'");
    for (const role of ['anon', 'authenticated']) {
      await db.exec(`reset role; set role ${role}`);
      await expect(db.query('select * from public.admin_architecture_subscriptions')).rejects.toThrow(/permission denied/);
      await expect(db.exec("update public.admin_architecture_subscriptions set fee='0'")).rejects.toThrow(/permission denied/);
    }
  } finally { await db.close(); }
});
