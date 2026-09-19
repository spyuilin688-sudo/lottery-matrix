import {optimizeSnapshot,sanitizeOptimizer,type OptimizerReport} from './matrix-optimizer';
import {sanitizeRailwayEvidence,type RailwayEvidence} from './matrix-railway-evidence';
export type OptimizerScope='railway'|'database';
type Rpc=(name:string,body:Record<string,unknown>)=>Promise<unknown>;
type Dependencies={rpc:Rpc;collectRailway:(at:Date)=>Promise<RailwayEvidence[]>};
const row=(value:unknown):Record<string,unknown>|null=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:null;
export function mergeOptimizerReports(railway?:OptimizerReport,database?:OptimizerReport):OptimizerReport|undefined {
 const reports=[railway,database].filter((r):r is OptimizerReport=>Boolean(r));
 if(!reports.length)return;
 return {checkedAt:reports.map(r=>r.checkedAt).sort((a,b)=>Date.parse(b)-Date.parse(a))[0],
  candidates:[...(railway?.candidates??[]).slice(0,50),...(database?.candidates??[]).slice(0,50)],
  coverage:[...new Set(reports.flatMap(r=>r.coverage))].slice(0,8),retentionDays:90,
  sourceChecks:{...(railway?{railway:railway.checkedAt}:{}),...(database?{database:database.checkedAt}:{})}};
}
export function createOptimizerRunner({rpc,collectRailway}:Dependencies) {
 async function latest(scope:OptimizerScope) {
  return sanitizeOptimizer(await rpc('matrix_optimizer_latest',{p_scope:scope}));
 }
 return {
  async latestReport() {
   const [railway,database]=await Promise.all([latest('railway'),latest('database')]);
   return mergeOptimizerReports(railway,database);
  },
  async history(scope:OptimizerScope,before?:string) {
   return rpc('matrix_optimizer_history',{p_scope:scope,p_before:before??null,p_limit:24});
  },
  async run(scope:OptimizerScope,owner:string):Promise<{status:'saved'|'skipped'}> {
   if(scope!=='railway'&&scope!=='database')throw new Error('OPTIMIZER_SCOPE_INVALID');
   const claim=row(await rpc('matrix_optimizer_claim',{p_scope:scope,p_owner_id:owner}));
   if(claim?.acquired===false)return {status:'skipped'};
   if(claim?.acquired!==true)throw new Error('OPTIMIZER_CLAIM_FAILED');
   try {
    const at=new Date(String(claim.observedAt));const slot=new Date(String(claim.slot));
    if(!Number.isFinite(at.getTime())||!Number.isFinite(slot.getTime()))throw new Error('OPTIMIZER_SLOT_INVALID');
    const previous=await latest(scope);
    let railway:RailwayEvidence[]=[];let database:Record<string,unknown>|null=null;
    if(scope==='railway') {
     const [evidence,counters]=await Promise.all([
      collectRailway(slot).catch(()=>[]),
      rpc('matrix_optimizer_job_counters',{}).catch(()=>null),
     ]);
     railway=sanitizeRailwayEvidence(evidence).map(service=>{
      const seen=new Set<string>();
      return {...service,samples:service.samples.filter(sample=>{
       const time=Date.parse(sample.finishedAt);const key=JSON.stringify(sample);
       if(time<slot.getTime()-3600000||time>=slot.getTime()||seen.has(key))return false;
       seen.add(key);return true;
      })};
     });
     database=row(counters);
    } else database=row(await rpc('matrix_optimizer_snapshot',{}).catch(()=>null));
    const report=optimizeSnapshot(database,railway,at,previous);
    report.retentionDays=90;
    report.coverage=[scope==='railway'?'railway-hourly':'database-daily',
     ...(scope==='railway'?[railway.some(s=>s.metrics.length||s.samples.length)?'railway-observed':'railway-unavailable',database?'job-counters-observed':'job-counters-unavailable','logs: bounded latest deployment, previous hour only']:report.coverage.filter(c=>!c.startsWith('long-term-trends:'))),
     'retention: 90 days'].slice(0,8);
    const stored=await rpc('matrix_optimizer_finish',{p_scope:scope,p_slot:claim.slot,p_owner_id:owner,p_report:sanitizeOptimizer(report),p_evidence:scope==='railway'?{railway,jobs:database?.jobs??null}:database??{unavailable:true}});
    if(stored!==true)throw new Error('OPTIMIZER_WRITE_FAILED');
    return {status:'saved'};
   } finally {
    await rpc('release_matrix_watchdog_lease',{p_lease_key:`optimizer:${scope}`,p_owner_id:owner}).catch(()=>undefined);
   }
  },
 };
}
