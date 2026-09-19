import {expect,it,vi} from 'vitest';
import {createRailwayEvidenceCollector,runtimeSamples} from './matrix-railway-evidence';
it('does not send a request without a platform token',async()=>{
 const fetcher=vi.fn();const r=await createRailwayEvidenceCollector(async()=>null,fetcher)();
 expect(fetcher).not.toHaveBeenCalled();expect(r).toHaveLength(5);expect(r.every(s=>s.code==='CONFIG_MISSING')).toBe(true);
});
it('does not retain arbitrary runtime log text or secrets',()=>{
 expect(runtimeSamples([{message:'token=secret'},{message:JSON.stringify({lottery:'天天樂',period:'12004',outcome:'failed',durationMs:10,finishedAt:'2026-09-19T00:00:00Z',token:'secret'})}])).toEqual([{lottery:'天天樂',period:'12004',outcome:'failed',durationMs:10,finishedAt:'2026-09-19T00:00:00Z',executionVersion:'unknown'}]);
});
it('retains failures without a period for service-level statistics',()=>{
 expect(runtimeSamples([{message:JSON.stringify({lottery:'天天樂',period:null,outcome:'failed',durationMs:10,finishedAt:'2026-09-19T00:00:00Z'})}])[0].period).toBeNull();
});
