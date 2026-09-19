import type { RailwayEvidence } from './matrix-railway-evidence';
export type OptimizationCandidate = {category:'railway'|'database'|'security'|'code';subject:string;observation:string;evidence:string[];state:'candidate'|'insufficient-evidence'};
type Observation = {subject:string;kind:'index'|'table';value:number;firstObservedAt:string;observedAt:string;statsReset:string|null};
export type OptimizerReport = {checkedAt:string;candidates:OptimizationCandidate[];coverage:string[];observations?:Observation[]};
type Row = Record<string,unknown>;
const rows=(v:unknown):Row[]=>Array.isArray(v)?v.filter(r=>r&&typeof r==='object'&&!Array.isArray(r)).slice(0,300):[];
export function optimizeSnapshot(database:Row|null,railway:RailwayEvidence[],at=new Date(),previous?:OptimizerReport):OptimizerReport {
 const candidates:OptimizationCandidate[]=[];
 const observations:Observation[]=[];
 const timestamp=at.toISOString();
 const reset=typeof database?.statsReset==='string'?database.statsReset:null;
 const prior=(subject:string,kind:Observation['kind'])=>previous?.observations?.find(o=>o.subject===subject&&o.kind===kind);
 const observe=(subject:string,kind:Observation['kind'],value:number)=>{
  const old=prior(subject,kind);
  const consistent=old&&reset!==null&&old.statsReset===reset&&Date.parse(old.observedAt)<at.getTime()&&(kind!=='index'||value>=old.value);
  const observation:Observation={subject,kind,value,firstObservedAt:consistent?old.firstObservedAt:timestamp,observedAt:timestamp,statsReset:reset};
  observations.push(observation);return observation;
 };
 const add=(category:OptimizationCandidate['category'],subject:string,observation:string,evidence:string[],state:OptimizationCandidate['state']='insufficient-evidence')=>candidates.push({category,subject,observation,evidence,state});
 for(const i of rows(database?.indexes)) {
  const observation=observe(`${i.schemaname}.${i.indexrelname}:${i.identity}`,'index',Number(i.idx_scan)||0);
  if(Number(i.idx_scan)===0&&!i.indisunique&&!i.indisprimary) add('database',`${i.schemaname}.${i.indexrelname}`,'未使用索引觀察候選',[`idx_scan=0; bytes=${i.bytes}`,`stats_reset=${database?.statsReset??'unknown'}; first_observed=${observation.firstObservedAt}`,'需要跨統計重設週期的觀察，以及程式／外鍵依賴審查；不自動刪除']);
 }
 for(const q of rows(database?.statements)) {
  if(Number(q.mean_exec_time)>1000) add('database',`queryid:${q.queryid}`,'慢 SQL 候選',[`平均 ${Number(q.mean_exec_time).toFixed(1)} ms; calls=${q.calls}`,'需取得執行計畫及代表性工作負載'],'candidate');
 }
 for(const t of rows(database?.tables)) {
  const subject=`${t.schemaname}.${t.relname}`;const old=prior(subject,'table');
  observe(subject,'table',Number(t.bytes)||0);
  if(old&&Number(t.bytes)>old.value&&Date.parse(old.observedAt)<at.getTime()) add('database',subject,'資料表增長觀察',[`bytes_delta=${Number(t.bytes)-old.value}`,`from=${old.observedAt}; to=${timestamp}`]);
  if(Number(t.seq_tup_read)>1_000_000) add('database',`${t.schemaname}.${t.relname}`,'大量循序掃描觀察',[`seq_scan=${t.seq_scan}; seq_tup_read=${t.seq_tup_read}; bytes=${t.bytes}`,'累積計數不代表每次掃描昂貴；需比較前後差值']);
 }
 for(const f of rows(database?.functions)) {
  if(Number(f.calls)>0) add('database',`${f.schemaname}.${f.funcname}`,'RPC 執行統計',[`calls=${f.calls}; total_ms=${f.total_time}; self_ms=${f.self_time}`]);
 }
 for(const f of rows(database?.security)) add('security',`${f.schema}.${f.name}(${f.arguments})`,'匿名可執行 SECURITY DEFINER',[`oid=${f.identity}`,'需查實際 handler、身份驗證與呼叫用途；此提醒不等同漏洞']);
 for(const job of rows(database?.jobs)) {
  if(String(job.job_name).startsWith('matrix-recovery:')) add('railway',String(job.job_name),'恢復累計觀察',[`retry_count=${job.retry_count}; recovery_count=${job.recovery_count}`,`last_recovery_at=${job.last_recovery_at??'none'}`]);
 }
 for(const service of railway) {
  const samples=service.samples;
  if(!samples.length) {add('railway',service.service,'執行樣本不足',[service.code]);continue;}
  for(const lottery of new Set(samples.map(s=>s.lottery))) {
   const group=samples.filter(s=>s.lottery===lottery);
   add('railway',`${service.service}:${lottery}`,'彩種執行時間觀察',[`samples=${group.length}; avg_ms=${(group.reduce((a,s)=>a+s.durationMs,0)/group.length).toFixed(1)}`]);
  }
  const failed=samples.filter(s=>s.outcome==='failed').length;
  const idle=samples.filter(s=>['already-acquired','already-analyzed','no-new-draw','not-due'].includes(s.outcome)).length;
  add('railway',service.service,'執行時間與跳過次數觀察',[`samples=${samples.length}; avg_ms=${(samples.reduce((a,s)=>a+s.durationMs,0)/samples.length).toFixed(1)}; failures=${failed}; idle=${idle}`,`logs_truncated=${service.logsTruncated}; 僅代表所取樣本`,...service.metrics.map(m=>`${m.measurement}: avg=${m.average}; max=${m.max}; samples=${m.count}`)]);
  const completed=samples.filter(s=>s.period!==null&&['analysis-completed','complete'].includes(s.outcome));
  const keys=new Map<string,number>();for(const s of completed){const k=`${s.lottery}:${s.period}:${s.executionVersion}`;keys.set(k,(keys.get(k)??0)+1);}
  for(const [key,count] of keys) if(count>1) add('railway',`${service.service}:${key}`,'同一期與程式版本多次完整執行',[`次數=${count}`,'需排除來源修正與必要恢復；不同版本重算不計入'],'candidate');
 }
 return {checkedAt:at.toISOString(),observations:observations.slice(0,300),candidates:candidates.slice(0,100),coverage:[database?'database-observed':'database-unavailable',database?.statements?'sql-statistics-observed':'sql-statistics-unavailable','edge-handler-review: main CI artifact','edge-runtime-unavailable','long-term-trends: schedule/retention-not-configured']};
}
export function sanitizeOptimizer(value:unknown):OptimizerReport|undefined {
 if(!value||typeof value!=='object')return;
 const raw=value as Row;if(typeof raw.checkedAt!=='string'||!Number.isFinite(Date.parse(raw.checkedAt)))return;
 const text=(v:unknown,max=240)=>typeof v==='string'?v.slice(0,max):'';
 return {checkedAt:raw.checkedAt,observations:rows(raw.observations).slice(0,300).filter(o=>(o.kind==='index'||o.kind==='table')&&Number.isFinite(o.value)&&Number.isFinite(Date.parse(String(o.observedAt)))&&Number.isFinite(Date.parse(String(o.firstObservedAt)))).map(o=>({subject:text(o.subject),kind:o.kind as Observation['kind'],value:Number(o.value),firstObservedAt:text(o.firstObservedAt,40),observedAt:text(o.observedAt,40),statsReset:typeof o.statsReset==='string'?text(o.statsReset,40):null})),candidates:rows(raw.candidates).slice(0,100).flatMap(c=>['railway','database','security','code'].includes(String(c.category))?[{category:c.category as OptimizationCandidate['category'],subject:text(c.subject),observation:text(c.observation),state:c.state==='candidate'?'candidate':'insufficient-evidence',evidence:Array.isArray(c.evidence)?c.evidence.slice(0,6).map(v=>text(v)):[]}]:[]),coverage:Array.isArray(raw.coverage)?raw.coverage.slice(0,8).map(v=>text(v)):[]};
}
