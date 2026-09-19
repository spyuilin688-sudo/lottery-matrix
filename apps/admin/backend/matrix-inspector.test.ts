import { expect, it } from 'vitest';
import { inspectChain } from './matrix-inspector';
import { evaluateChain, CHAIN_STAGES } from './matrix-chain';
it('reports a broken layer without inventing the underlying cause', () => {
 const at='2026-09-20T00:00:00Z';
 const report=evaluateChain({lottery:'天天樂',drawPeriod:'12004',checkedAt:at,stages:CHAIN_STAGES.map(stage=>({stage,state:stage==='analysis'?'FAIL':'PASS',source:'supabase',period:'12004',observedAt:at,code:'ANALYSIS_INCOMPLETE'}))});
 const result=inspectChain(report,[]);
 expect(result.faultLayer).toBe('analysis');
 expect(result.rootCause).toBeNull();
 expect(result.checks.some(c=>c.state==='UNKNOWN')).toBe(true);
});
