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
