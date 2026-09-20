import type { ChainReport, ChainStage, StageState } from './matrix-chain';
import type { RailwayEvidence } from './matrix-railway-evidence';
export type Diagnosis = {
 lottery:ChainReport['lottery'];drawPeriod:string|null;faultLayer:ChainStage|null;
 rootCause:{code:string;evidence:string[]}|null;
 checks:Array<{name:string;state:StageState;code:string;source:string}>;
};
const executionStates:Record<string,StageState> = {
 'already-acquired':'PASS','already-analyzed':'PASS','analysis-completed':'PASS',
 'repair-completed':'PASS','complete':'PASS','failed':'FAIL',
 'not-acquired':'WAITING','not-due':'WAITING','no-new-draw':'WAITING',
};
export function inspectChain(report:ChainReport,railway:RailwayEvidence[]):Diagnosis {
 const fault=report.stages.find(s=>s.state==='FAIL');
 const services=report.lottery==='天天樂' ? ['fantasy5-crawler','fantasy5-analysis'] : ['lottery-matrix'];
 const checks:Diagnosis['checks']=report.stages.map(s=>({name:s.stage,state:s.state,code:s.code,source:s.source}));
 for(const service of services){
  const evidence=railway.find(r=>r.service===service);
  const available=evidence?.code==='OBSERVED';
  checks.push({name:`${service}:cron`,state:available&&evidence.cronSchedule?'PASS':'UNKNOWN',code:available&&evidence.cronSchedule?'CRON_CONFIGURED':'CRON_UNAVAILABLE',source:'Railway service configuration'});
  const deployment=evidence?.deployment;
  checks.push({name:`${service}:deployment`,state:!deployment?'UNKNOWN':['FAILED','CRASHED'].includes(deployment.status)?'FAIL':deployment.status==='SUCCESS'?'PASS':'WAITING',code:deployment?.status ?? 'DEPLOYMENT_UNAVAILABLE',source:'Railway deployment'});
  // Bounded logs: missing a matching run is never proof that Cron did not fire.
  const sample=evidence?.samples.filter(s=>report.drawPeriod!==null&&s.period!==null&&s.lottery===report.lottery&&s.period===report.drawPeriod).sort((a,b)=>Date.parse(b.finishedAt)-Date.parse(a.finishedAt))[0];
  checks.push({name:`${service}:execution`,state:!sample?'UNKNOWN':executionStates[sample.outcome]??'UNKNOWN',code:sample?.outcome??'PERIOD_LOG_UNAVAILABLE',source:'Railway structured runtime log'});
 }
 // Stage and execution evidence alone do not establish an underlying cause.
 const rootCause = null;
 return {lottery:report.lottery,drawPeriod:report.drawPeriod,faultLayer:fault?.stage??null,rootCause,checks};
}
