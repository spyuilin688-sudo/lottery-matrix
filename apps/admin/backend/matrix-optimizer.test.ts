import {expect,it} from 'vitest';
import {optimizeSnapshot} from './matrix-optimizer';
it('treats unused indexes and anonymous definers as observations, never instructions to mutate',()=>{
 const report=optimizeSnapshot({indexes:[{schemaname:'public',indexrelname:'x',idx_scan:0}],security:[{schema:'public',name:'rpc',arguments:'',identity:'1'}]},[]);
 expect(report.candidates).toHaveLength(2);
 expect(report.candidates.every(c=>c.state==='insufficient-evidence')).toBe(true);
});
it('explicitly reports unavailable SQL statistics',()=>expect(optimizeSnapshot(null,[]).coverage).toContain('sql-statistics-unavailable'));
it('only carries an index observation across the same known stats reset',()=>{
 const snapshot={statsReset:'2026-09-01T00:00:00Z',indexes:[{schemaname:'public',indexrelname:'idx',identity:'1',idx_scan:0}]};
 const a=optimizeSnapshot(snapshot,[],new Date('2026-09-10T00:00:00Z'));
 const b=optimizeSnapshot(snapshot,[],new Date('2026-09-20T00:00:00Z'),a);
 expect(b.observations?.[0].firstObservedAt).toBe(a.checkedAt);
 const c=optimizeSnapshot({...snapshot,statsReset:'2026-09-19T00:00:00Z'},[],new Date('2026-09-21T00:00:00Z'),b);
 expect(c.observations?.[0].firstObservedAt).toBe(c.checkedAt);
});

import type {RailwayEvidence} from './matrix-railway-evidence';
function idleService(overrides:Partial<RailwayEvidence>={}):RailwayEvidence {
 return {service:'lottery-matrix',serviceId:'test',observedAt:'2026-09-20T08:00:00Z',code:'OBSERVED',deployment:null,cronSchedule:'3/10 * * * *',logsAvailable:true,logsTruncated:false,
  metrics:[{measurement:'CPU_USAGE',average:0.1,max:0.2,count:60},{measurement:'MEMORY_USAGE_GB',average:0.3,max:0.4,count:60}],
  samples:Array.from({length:49},(_,i)=>({lottery:'今彩539',period:'115000001',outcome:'already-analyzed',durationMs:20,executionVersion:'v1',finishedAt:new Date(Date.UTC(2026,8,20,0,i*10)).toISOString()})),...overrides};
}
it('classifies repeated idle executions with exact sample span and resource evidence',()=>{
 const report=optimizeSnapshot(null,[idleService()]);
 const candidate=report.candidates.find(c=>c.observation==='重複空轉執行候選');
 expect(candidate?.state).toBe('candidate');
 expect(candidate?.evidence.join(' ')).toContain('samples=49; idle=49');
 expect(candidate?.evidence.join(' ')).toContain('span_ms=28800000');
 expect(candidate?.evidence.join(' ')).toContain('CPU_USAGE');
 expect(candidate?.evidence.join(' ')).toContain('MEMORY_USAGE_GB');
});
it.each(['complete','failed','notification-only','repair-completed'])('does not classify mixed %s work as fully idle',outcome=>{
 const service=idleService();service.samples[0].outcome=outcome;
 expect(optimizeSnapshot(null,[service]).candidates.some(c=>c.observation==='重複空轉執行候選')).toBe(false);
});
it('does not infer repeated idle from a single execution, duplicated log, or missing logs',()=>{
 const service=idleService();
 for(const overrides of [{samples:service.samples.slice(0,1)},{samples:[service.samples[0],service.samples[0]]},{logsAvailable:false},{code:'READ_FAILED' as const}]) {
  expect(optimizeSnapshot(null,[idleService(overrides)]).candidates.some(c=>c.observation==='重複空轉執行候選')).toBe(false);
 }
});
it('keeps bounded idle evidence explicit even when older logs were truncated',()=>{
 const report=optimizeSnapshot(null,[idleService({logsTruncated:true})]);
 expect(report.candidates.find(c=>c.observation==='重複空轉執行候選')?.evidence.join(' ')).toContain('logs_truncated=true');
});
