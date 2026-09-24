import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { expect, it } from 'vitest';

it('atomically claims bounded tasks, fences stale results and restricts RPCs', async () => {
  const db = new PGlite();
  try {
    await db.exec('create role anon; create role authenticated; create role service_role bypassrls;');
    await db.exec(readFileSync(new URL('../../../supabase/migrations/20260920102528_manual_refresh_jobs.sql', import.meta.url), 'utf8'));
    await db.exec('set role service_role');
    const id = '11111111-1111-4111-8111-111111111111';
    const next = '22222222-2222-4222-8222-222222222222';
    const claim = async (requestId: string) => (await db.query<{task: any}>("select public.matrix_manual_refresh_claim('天天樂', $1) as task", [requestId])).rows[0].task;
    expect(await claim(id)).toMatchObject({ requestId: id, status: 'accepted' });
    expect(await claim(next)).toMatchObject({ requestId: id });
    expect((await db.query("select public.matrix_manual_refresh_update('天天樂', $1, 'complete','123',null,null) as ok", [next])).rows).toEqual([{ok:false}]);
    await db.exec("update public.matrix_manual_refresh_jobs set expires_at = now() - interval '1 minute'");
    expect((await db.query<{task:any}>("select public.matrix_manual_refresh_status('天天樂', $1) as task", [id])).rows[0].task).toMatchObject({ status: 'failed', error: 'REFRESH_INTERRUPTED' });
    expect(await claim(next)).toMatchObject({ requestId: next, status: 'accepted' });
    expect((await db.query("select public.matrix_manual_refresh_update('天天樂', $1, 'complete','123',null,null) as ok", [id])).rows).toEqual([{ok:false}]);
    await db.query("select public.matrix_manual_refresh_update('天天樂', $1, 'complete','123','2026-09-20',null)", [next]);
    expect((await db.query<{task:any}>("select public.matrix_manual_refresh_status('天天樂', $1) as task", [next])).rows[0].task).toMatchObject({ status: 'complete', period: '123' });
    expect((await db.query('select count(*)::int as count from public.matrix_manual_refresh_jobs')).rows).toEqual([{count:1}]);
    for (const role of ['anon', 'authenticated']) {
      await db.exec(`reset role; set role ${role}`);
      await expect(claim(id)).rejects.toThrow(/permission denied/);
      await expect(db.query('select * from public.matrix_manual_refresh_jobs')).rejects.toThrow(/permission denied/);
      await expect(db.query("select public.matrix_manual_refresh_status('天天樂', $1)", [id])).rejects.toThrow(/permission denied/);
      await expect(db.query("select public.matrix_manual_refresh_update('天天樂', $1, 'running')", [id])).rejects.toThrow(/permission denied/);
    }
  } finally { await db.close(); }
}, 20_000);
