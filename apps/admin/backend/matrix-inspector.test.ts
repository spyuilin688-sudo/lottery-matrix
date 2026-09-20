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

import type { RailwayEvidence } from './matrix-railway-evidence';
it.each([['not-acquired','WAITING'],['not-due','WAITING'],['no-new-draw','WAITING'],['notification-only','UNKNOWN'],['failed','FAIL'],['complete','PASS'],['analysis-completed','PASS'],['unexpected','UNKNOWN']])('classifies %s as %s, not blanket success', (outcome,state)=>{
 const at='2026-09-20T00:00:00Z';
 const report=evaluateChain({lottery:'天天樂',drawPeriod:'12004',checkedAt:at,stages:[]});
 const evidence:RailwayEvidence={service:'fantasy5-crawler',serviceId:'test',observedAt:at,code:'OBSERVED',deployment:null,cronSchedule:null,logsAvailable:true,logsTruncated:false,metrics:[],samples:[{lottery:'天天樂',period:'12004',outcome,durationMs:1,executionVersion:'test',finishedAt:at}]};
 expect(inspectChain(report,[evidence]).checks.find(c=>c.name==='fantasy5-crawler:execution')?.state).toBe(state);
});
