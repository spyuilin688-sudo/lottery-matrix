import { describe, expect, it, vi } from 'vitest';
import { createConnectionStatus } from './connection-status';
import { CHAIN_STAGES, type ChainReport, type StageState } from './matrix-chain';
import type { WatchdogStatus } from './watchdog-status';

const at = '2026-09-21T02:10:00.000Z';
const reports = (state: StageState = 'PASS'): ChainReport[] =>
  (['今彩539','天天樂','六合彩','大樂透'] as const).map(lottery => ({
    lottery, drawPeriod:'12006', checkedAt:at, state,
    stages: CHAIN_STAGES.map(stage => ({stage, state, source:'supabase', observedAt:at, period:'12006', code:'VERIFIED'})),
  }));
const heartbeat: WatchdogStatus = {
  status:'degraded', checkedAt:'2026-09-21T02:00:00.000Z', completedAt:'2026-09-21T02:00:06.000Z',
  schedule:{checkedAt:'2026-09-21T02:00:00.000Z',due:true,pendingSince:null,nextCheckAt:'2026-09-21T12:30:00.000Z'},
  dueLotteries:['天天樂'], actions:[{lottery:'天天樂',target:'railway',reasons:['crawler-stale'],outcome:'accepted'}],
  recoveryReports:reports('FAIL').filter(r => r.lottery === '天天樂'),
};
function service(observe: () => Promise<unknown>, historical = heartbeat) {
  return createConnectionStatus({
    supabase:{selectRows:async () => []},loadConfig:async()=>({url:'https://db.test',serviceRoleKey:'secret'}),
    fetcher:async()=>new Response('{}'), getWorkerStatus:async()=>({ok:false,reason:'RAILWAY_UNAVAILABLE',health:null,jobs:null}),
    loadWatchdogStatus:async()=>historical, observeWatchdog:observe, now:()=>new Date(at),
  });
}
const watchdog = async (status: ReturnType<typeof service>) => (await status.get()).items.find(item => item.id === 'supabase-watchdog-heartbeat')!;
describe('watchdog recovery observation',()=>{
  it('uses newly verified chains after an accepted recovery while preserving historical evidence',async()=>{
    const item = await watchdog(service(async()=>({checkedAt:at,reports:reports()})));
    expect(item).toMatchObject({ok:true,healthState:'waiting',detail:{status:'degraded',completedAt:heartbeat.completedAt,
      recoveryReports:heartbeat.recoveryReports,observation:{checkedAt:at,status:'ok',source:'read-only-chain'},reports:reports()}});
  });
  it.each(['FAIL','UNKNOWN','WAITING'] as const)('does not hide a current %s chain behind an idle schedule',async(state)=>{
    const item = await watchdog(service(async()=>({checkedAt:at,reports:reports(state)})));
    expect(item.ok).toBe(false);
    expect(item.detail).toMatchObject({observation:{status:'degraded'},reports:reports(state)});
  });
  it.each([[], reports().slice(0,3), reports().map(r=>({...r,checkedAt:'2026-09-20T00:00:00Z'}))])('does not accept incomplete or old observation evidence',async current=>{
    const item = await watchdog(service(async()=>({checkedAt:at,reports:current})));
    expect(item.ok).toBe(false);
  });
  it('preserves a real scheduler failure without using fresh chains to clear it',async()=>{
    const observe = vi.fn(async()=>({checkedAt:at,reports:reports()}));
    const item = await watchdog(service(observe,{...heartbeat,schedule:{...heartbeat.schedule!,nextCheckAt:'2026-09-21T01:00:00Z'}}));
    expect(item.ok).toBe(false);expect(observe).not.toHaveBeenCalled();
  });
  it('keeps the historical failure when independent evidence is unavailable',async()=>{
    expect((await watchdog(service(async()=>{throw new Error('secret');}))).ok).toBe(false);
  });
  it('shares only in-flight reads and rechecks changed evidence on the next request',async()=>{
    let resolve!:(value:unknown)=>void;
    const observe = vi.fn().mockImplementationOnce(()=>new Promise(r=>{resolve=r;})).mockResolvedValueOnce({checkedAt:at,reports:reports('FAIL')});
    const status=service(observe);const one=watchdog(status);const two=watchdog(status);
    await vi.waitFor(()=>expect(observe).toHaveBeenCalledTimes(1));
    resolve({checkedAt:at,reports:reports()});expect((await Promise.all([one,two])).every(item=>item.ok)).toBe(true);
    expect((await watchdog(status)).ok).toBe(false);expect(observe).toHaveBeenCalledTimes(2);
  });
});
