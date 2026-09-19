import type { ChainReport, ChainStage, StageState } from './matrix-chain';
import type { RailwayEvidence } from './matrix-railway-evidence';
export type Diagnosis = {
 lottery:ChainReport['lottery'];drawPeriod:string|null;faultLayer:ChainStage|null;
 rootCause:{code:string;evidence:string[]}|null;
 checks:Array<{name:string;state:StageState;code:string;source:string}>;
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
  checks.push({name:`${service}:execution`,state:!sample?'UNKNOWN':sample.outcome==='failed'?'FAIL':'PASS',code:sample?.outcome??'PERIOD_LOG_UNAVAILABLE',source:'Railway structured runtime log'});
 }
 const rootCause = fault?.code === 'CUSTOM_CONFIG_MISMATCH' ? {code: 'CUSTOM_CONFIG_CHANGED', evidence: ['目前設定與同一期已存結果的 config_key 不符', fault.source]} : null;
 return {lottery:report.lottery,drawPeriod:report.drawPeriod,faultLayer:fault?.stage??null,rootCause,checks};
}
