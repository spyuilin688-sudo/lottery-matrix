import { expect, it } from 'vitest';
import { createConnectionStatus } from './connection-status';
import { sanitizeWatchdogStatus } from './watchdog-status';
import { getSystemStatusPresentation } from '../src/system-status';

const now = new Date('2026-09-19T21:56:00Z');
const heartbeat = { status: 'ok', checkedAt: '2026-09-19T21:34:49Z', completedAt: '2026-09-19T21:34:50Z', actions: [], dueLotteries: [] };
const idle = { checkedAt: '2026-09-19T21:53:00Z', due: false, pendingSince: null };
async function check(schedule: unknown, extra = {}) {
  const service = createConnectionStatus({
    supabase: { selectRows: async () => [] },
    loadConfig: async () => ({ url: 'https://example.test', serviceRoleKey: 'test-only' }),
    getWorkerStatus: async () => ({ ok: false, reason: 'RAILWAY_ADMIN_CONFIG_MISSING' }),
    fetcher: async () => new Response('{}', { headers: { 'Content-Type': 'application/json' } }),
    loadWatchdogStatus: async () => sanitizeWatchdogStatus({ ...heartbeat, ...extra, schedule }),
    now: () => now,
  });
  return (await service.get()).items.find(item => item.id === 'supabase-watchdog-heartbeat')!;
}
it('does not call a recent idle cron tick a monitoring failure', async () => {
  const item = await check(idle);
  expect(item.ok).toBe(true);
  expect(getSystemStatusPresentation(item).label).toBe('排程待命');
  expect(item.detail).toMatchObject({ completedAt: '2026-09-19T21:34:50.000Z', schedule: idle });
});
it('reports an outstanding request as waiting within the completion deadline', async () => {
  const item = await check({ ...idle, due: true, pendingSince: '2026-09-19T21:53:00Z' });
  expect(item.ok).toBe(true);
  expect(getSystemStatusPresentation(item).label).toBe('等待監控完成');
});
it('does not hide an overdue request behind a later idle tick', async () => {
  const item = await check({ ...idle, pendingSince: '2026-09-19T21:36:00Z' });
  expect(item.ok).toBe(false);
  expect(item.error).toContain('18 分鐘');
});
it('still fails when cron itself stops or schedule evidence is invalid', async () => {
  for (const schedule of [{ ...idle, checkedAt: '2026-09-19T21:33:00Z' }, { ...idle, pendingSince: 'invalid' }, { ...idle, checkedAt: '2026-09-19T22:00:00Z' }, undefined]) {
    expect((await check(schedule)).ok).toBe(false);
  }
});
it('does not turn a previous failed chain healthy just because cron is idle', async () => {
  expect((await check(idle, { status: 'degraded', error: 'WATCHDOG_FAILED' })).ok).toBe(false);
});
it('keeps an intentional long rest healthy until its persisted next check',async()=>{
 const item=await check({...idle,checkedAt:'2026-09-19T12:30:00Z',due:false,nextCheckAt:'2026-09-20T01:30:00Z'});
 expect(item.ok).toBe(true);
});
it('does not hide missed dynamic checks or outstanding HTTP failures',async()=>{
 expect((await check({...idle,checkedAt:'2026-09-19T12:30:00Z',nextCheckAt:'2026-09-19T21:30:00Z'})).ok).toBe(false);
 expect((await check({...idle,nextCheckAt:'2026-09-20T01:30:00Z',pendingSince:'2026-09-19T21:00:00Z'})).ok).toBe(false);
});
