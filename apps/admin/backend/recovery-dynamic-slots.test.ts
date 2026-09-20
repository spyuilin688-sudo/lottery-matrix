import {expect,it,vi} from 'vitest';
import {createSupabaseWatchdogSnapshotLoader,createIndependentWatchdog,expectedDrawDateForDueWindow,type WatchdogSnapshot} from './watchdog';

it.each([
 ['今彩539','2026-09-22T01:50:00+08:00','2026-09-21'],
 ['今彩539','2026-09-22T02:00:00+08:00',null],
 ['今彩539','2026-09-22T12:00:00+08:00','2026-09-21'],
 ['今彩539','2026-09-22T18:00:00+08:00','2026-09-21'],
 ['今彩539','2026-09-22T18:10:00+08:00',null],
 ['天天樂','2026-09-22T00:00:00+08:00','2026-09-21'],
 ['天天樂','2026-09-22T06:00:00+08:00','2026-09-21'],
 ['天天樂','2026-09-22T09:30:00+08:00','2026-09-22'],
 ['天天樂','2026-12-22T09:30:00+08:00','2026-12-22'],
] as const)('resolves the requested cycle for %s at %s',(lottery,at,expected)=>{
 expect(expectedDrawDateForDueWindow(lottery,new Date(at),['2026-09-21','2026-09-22','2026-12-22'])).toBe(expected);
});
it('does not load draws, chains, or calendar when the cycle has no pending recovery',async()=>{
 const calls:string[]=[];
 const loader=createSupabaseWatchdogSnapshotLoader({supabaseRequest:async<T>(path:string)=>{calls.push(path);if(path==='rpc/matrix_recovery_pending')return [] as T;throw new Error('unexpected heavy read');}});
 expect(await loader(new Date('2026-09-21T20:30:00+08:00'),true)).toEqual([]);
 expect(calls).toEqual(['rpc/matrix_recovery_pending']);
});
it('does not perform recovery or Railway collection when pending snapshot is empty',async()=>{
 const collectRailway=vi.fn();const recoverRailway=vi.fn();
 const result=await createIndependentWatchdog({loadSnapshot:async()=>[],collectRailway,recoverRailway,claimLease:vi.fn(),releaseLease:vi.fn(),dispatchFantasy5:vi.fn()}).run(new Date());
 expect(result.actions).toEqual([]);expect(collectRailway).not.toHaveBeenCalled();expect(recoverRailway).not.toHaveBeenCalled();
});
it('dispatches the stored cycle date for midnight Fantasy5 recovery',async()=>{
 const recoverRailway=vi.fn();
 const snapshot:WatchdogSnapshot={lottery:'天天樂',recoveryCycleDate:'2026-09-21',drawDays:[],latestDraw:null,latestAnalysis:null,job:null};
 await createIndependentWatchdog({loadSnapshot:async()=>[snapshot],recoverRailway,claimLease:async()=>true,releaseLease:vi.fn(),dispatchFantasy5:vi.fn()}).run(new Date('2026-09-22T00:00:00+08:00'),'owner');
 expect(recoverRailway).toHaveBeenCalledWith('天天樂','owner',{stage:'crawler',drawPeriod:null,minimumDrawDate:'2026-09-21'});
});
it('recovers formal data even when preliminary analysis is complete',async()=>{
 const recoverRailway=vi.fn();
 const snapshot:WatchdogSnapshot={lottery:'天天樂',recoveryCycleDate:'2026-09-21',drawDays:[],latestDraw:{period:'42',drawDate:'2026-09-21',resultStatus:'preliminary'},latestAnalysis:{drawPeriod:'42',status:'complete',startedAt:null,updatedAt:null,leaseExpiresAt:null},job:null};
 await createIndependentWatchdog({loadSnapshot:async()=>[snapshot],recoverRailway,claimLease:async()=>true,releaseLease:vi.fn(),dispatchFantasy5:vi.fn()}).run(new Date('2026-09-22T00:00:00+08:00'),'owner');
 expect(recoverRailway).toHaveBeenCalledWith('天天樂','owner',{stage:'crawler',drawPeriod:null,minimumDrawDate:'2026-09-21'});
});
