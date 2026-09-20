import {expect,it,vi} from 'vitest';
import {createOptimizerRunner,mergeOptimizerReports} from './matrix-optimizer-runner';
const slot='2026-09-20T02:00:00.000Z';
function setup(acquired=true) {
 const rpc=vi.fn(async(name:string,_body:unknown):Promise<unknown>=> name==='matrix_optimizer_claim'?{acquired,slot,observedAt:slot}:name==='matrix_optimizer_latest'?null:name==='matrix_optimizer_finish'?true:name==='matrix_optimizer_job_counters'?{jobs:[]}:{});
 const railway=vi.fn(async()=>[]);
 return {rpc,railway,runner:createOptimizerRunner({rpc,collectRailway:railway})};
}
it('hourly railway observation does not collect a database snapshot',async()=>{
 const {rpc,railway,runner}=setup(); await runner.run('railway','owner');
 expect(railway).toHaveBeenCalledWith(new Date(slot));
 expect(rpc.mock.calls.map(c=>c[0])).not.toContain('matrix_optimizer_snapshot');
 expect(rpc.mock.calls.map(c=>c[0])).toContain('matrix_optimizer_finish');
});
it('daily database observation never queries Railway',async()=>{
 const {rpc,railway,runner}=setup(); await runner.run('database','owner');
 expect(railway).not.toHaveBeenCalled();
 expect(rpc.mock.calls.map(c=>c[0])).toContain('matrix_optimizer_snapshot');
});
it('duplicate slot performs no collection or writes',async()=>{
 const {rpc,railway,runner}=setup(false);
 expect(await runner.run('railway','owner')).toEqual({status:'skipped'});
 expect(railway).not.toHaveBeenCalled(); expect(rpc).toHaveBeenCalledTimes(1);
});
it('failed persistence releases its owner lease and reports failure',async()=>{
 const {rpc,runner}=setup(); rpc.mockImplementation(async(name:string)=>name==='matrix_optimizer_claim'?{acquired:true,slot,observedAt:slot}:name==='matrix_optimizer_finish'?false:null);
 await expect(runner.run('database','owner')).rejects.toThrow('OPTIMIZER_WRITE_FAILED');
 expect(rpc).toHaveBeenCalledWith('release_matrix_watchdog_lease',{p_lease_key:'optimizer:database',p_owner_id:'owner'});
});
it('merged latest reports retain both source timestamps',()=>{
 const report=(checkedAt:string)=>({checkedAt,candidates:[],coverage:[]});
 expect(mergeOptimizerReports(report(slot),report('2026-09-19T16:00:00Z'))?.sourceChecks).toEqual({railway:slot,database:'2026-09-19T16:00:00Z'});
});

it('rejects an unknown scope before acquiring a lease',async()=>{
 const {rpc,runner}=setup();await expect(runner.run('unknown' as never,'a')).rejects.toThrow('OPTIMIZER_SCOPE_INVALID');expect(rpc).not.toHaveBeenCalled();
});
it('only stores deduplicated previous-hour samples while keeping CPU evidence',async()=>{
 const {rpc}=setup();
 const sample={lottery:'天天樂',period:null,outcome:'failed',durationMs:1,executionVersion:'v1',finishedAt:'2026-09-20T01:30:00Z'};
 const runner=createOptimizerRunner({rpc,collectRailway:async()=>[{service:'lottery-matrix',serviceId:'f421c5a3-0fd2-4a0b-813a-9d68ad9418b9',observedAt:slot,code:'OBSERVED',deployment:null,logsTruncated:false,metrics:[{measurement:'CPU_USAGE',average:1,max:2,count:1}],samples:[sample,sample,{...sample,finishedAt:slot},{...sample,finishedAt:'2026-09-20T00:59:59Z'}]} as never]});
 await runner.run('railway','a');
 const saved=rpc.mock.calls.find(c=>c[0]==='matrix_optimizer_finish')?.[1] as {p_evidence:{railway:{samples:unknown[];metrics:unknown[]}[]}};
 expect(saved.p_evidence.railway[0].samples).toHaveLength(1);expect(saved.p_evidence.railway[0].metrics).toHaveLength(1);
});
