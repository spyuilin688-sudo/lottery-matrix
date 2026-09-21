/** Read-only control-plane adapter. API queries follow Railway's public API/CLI schema. */
export const MATRIX_RAILWAY_PROJECT = '771346b5-650d-46c9-94a3-e0e5d70a6f21';
export const MATRIX_RAILWAY_ENVIRONMENT = 'eeef9d23-eaa7-4c4c-95c3-0da295a62e8c';
export const MATRIX_SERVICES = {
 'lottery-matrix':'f421c5a3-0fd2-4a0b-813a-9d68ad9418b9',
 'fantasy5-crawler':'205035ff-0cdf-495b-9911-cef3db4dce71',
 'fantasy5-analysis':'fd39e53e-7c2c-4a9d-bc17-288535ff3e19',
 'matrix-public-api':'58a61045-f675-4862-9847-6f4f430f2050',
 'matrix-recovery':'4214c2e9-0e07-46df-9d50-7dcb151cd2af',
} as const;
export type RuntimeSample = {lottery:string;period:string|null;outcome:string;durationMs:number;executionVersion:string;finishedAt:string};
export type RailwayEvidence = {
 service: string; serviceId: string; observedAt: string; code: 'OBSERVED'|'CONFIG_MISSING'|'READ_FAILED';
 deployment: {id:string;status:string;createdAt:string}|null;
 cronSchedule: string|null; logsAvailable: boolean; logsTruncated: boolean;
 samples: RuntimeSample[]; metrics: Array<{measurement:string;average:number;max:number;count:number}>;
};
type Config = {projectToken:string};
const OUTCOMES = new Set(['already-acquired','already-analyzed','no-new-draw','analysis-completed','repair-completed','notification-only','failed','complete','not-due','not-acquired']);
const SAMPLE_FIELDS = new Set(['lottery','period','outcome','durationMs','executionVersion','finishedAt']);
type RuntimeLog = {timestamp?:string;message?:string;attributes?:Array<{key:string;value:string}>};
export function runtimeSamples(logs: RuntimeLog[]): RuntimeSample[] {
 return logs.flatMap(log => {
  try {
   let r:Record<string,any>={};
   try {
    const message=JSON.parse(String(log.message ?? '').slice(0,16000));
    if(message && typeof message==='object' && !Array.isArray(message)) r=message;
   } catch { /* Railway can extract JSON fields and leave message empty. */ }
   for(const attribute of (Array.isArray(log.attributes)?log.attributes:[]).slice(0,100)) {
    if(!attribute || !SAMPLE_FIELDS.has(attribute.key) || typeof attribute.value!=='string' || attribute.value.length>16000) continue;
    try { r[attribute.key]=JSON.parse(attribute.value); }
    catch { r[attribute.key]=attribute.value; }
   }
   if (!['今彩539','天天樂','六合彩','大樂透'].includes(r.lottery) || !OUTCOMES.has(r.outcome) || !Number.isFinite(r.durationMs) || r.durationMs<0) return [];
   const period=r.period==null?null:String(r.period); const finishedAt=String(r.finishedAt ?? log.timestamp ?? '');
   if ((period!==null && !/^\d{1,20}$/.test(period)) || !Number.isFinite(Date.parse(finishedAt))) return [];
   return [{lottery:r.lottery,period,outcome:r.outcome,durationMs:r.durationMs,executionVersion:String(r.executionVersion??'unknown').slice(0,80),finishedAt}];
  } catch { return []; }
 }).slice(-100);
}
export function createRailwayEvidenceCollector(loadConfig:()=>Promise<Config|null>,fetcher:typeof fetch=fetch) {
 return async (at=new Date()):Promise<RailwayEvidence[]> => {
  const base = Object.entries(MATRIX_SERVICES).map(([service,serviceId]):RailwayEvidence=>({service,serviceId,observedAt:at.toISOString(),code:'CONFIG_MISSING',deployment:null,cronSchedule:null,logsAvailable:false,logsTruncated:false,samples:[],metrics:[]}));
  let config:Config|null; try { config=await loadConfig(); } catch { return base; }
  if (!config?.projectToken) return base;
  async function query(query:string,variables:Record<string,unknown>) {
   const response=await fetcher('https://backboard.railway.com/graphql/v2',{method:'POST',redirect:'error',signal:AbortSignal.timeout(8000),headers:{'Content-Type':'application/json','Project-Access-Token':config!.projectToken},body:JSON.stringify({query,variables})});
   if (!response.ok) throw new Error('RAILWAY_READ_FAILED');
   const payload=await response.json();
   if (payload.errors || !payload.data) throw new Error('RAILWAY_READ_FAILED');
   return payload.data;
  }
  let environment;
  try {
   environment=(await query('query($projectId:String!,$environmentId:String!){environment(id:$environmentId,projectId:$projectId){serviceInstances(first:50){edges{node{serviceId cronSchedule latestDeployment{id status createdAt}}}}}}',{projectId:MATRIX_RAILWAY_PROJECT,environmentId:MATRIX_RAILWAY_ENVIRONMENT})).environment;
  } catch { return base.map(r=>({...r,code:'READ_FAILED'})); }
  return Promise.all(base.map(async record => {
   const node=environment?.serviceInstances?.edges?.find((e:{node:{serviceId:string}})=>e.node.serviceId===record.serviceId)?.node;
   if (!node) return {...record,code:'READ_FAILED' as const};
   const deployment=node.latestDeployment;
   const observed:RailwayEvidence={...record,code:'OBSERVED',cronSchedule:typeof node.cronSchedule==='string'?node.cronSchedule.slice(0,80):null,deployment:deployment?{id:String(deployment.id).slice(0,80),status:String(deployment.status).slice(0,40),createdAt:String(deployment.createdAt).slice(0,40)}:null};
   const [logs,metrics]=await Promise.allSettled([
    deployment ? query('query($id:String!){deploymentLogs(deploymentId:$id,limit:100){timestamp message attributes{key value}}}',{id:deployment.id}) : Promise.reject(new Error('NO_DEPLOYMENT')),
    query('query($serviceId:String,$environmentId:String,$start:DateTime!,$end:DateTime){metrics(serviceId:$serviceId,environmentId:$environmentId,startDate:$start,endDate:$end,measurements:[CPU_USAGE,MEMORY_USAGE_GB],sampleRateSeconds:60){measurement values{ts value}}}',{serviceId:record.serviceId,environmentId:MATRIX_RAILWAY_ENVIRONMENT,start:new Date(at.getTime()-3600000).toISOString(),end:at.toISOString()}),
   ]);
   if (logs.status==='fulfilled' && Array.isArray(logs.value.deploymentLogs)) {
    observed.logsAvailable=true;observed.logsTruncated=logs.value.deploymentLogs.length>=100;
    observed.samples=runtimeSamples(logs.value.deploymentLogs);
   }
   if(metrics.status==='fulfilled' && Array.isArray(metrics.value.metrics)) {
    observed.metrics=metrics.value.metrics.flatMap((m:{measurement:string;values:Array<{value:number}>})=>{
     const values=(m.values??[]).map(v=>v.value).filter(v=>Number.isFinite(v)&&v>=0);
     return values.length && ['CPU_USAGE','MEMORY_USAGE_GB'].includes(m.measurement) ? [{measurement:m.measurement,average:values.reduce((a,b)=>a+b,0)/values.length,max:Math.max(...values),count:values.length}] : [];
    });
   }
   return observed;
  }));
 };
}

export function sanitizeRailwayEvidence(value:unknown):RailwayEvidence[] {
 if(!Array.isArray(value))return [];
 const text=(v:unknown,max=100)=>typeof v==='string'?v.slice(0,max):'';
 return Object.entries(MATRIX_SERVICES).flatMap(([service,serviceId])=>{
  const r=value.find(v=>v&&v.service===service&&v.serviceId===serviceId);
  if(!r||!Number.isFinite(Date.parse(r.observedAt)))return [];
  return [{service,serviceId,observedAt:text(r.observedAt,40),code:['OBSERVED','CONFIG_MISSING','READ_FAILED'].includes(r.code)?r.code:'READ_FAILED',cronSchedule:typeof r.cronSchedule==='string'?text(r.cronSchedule,80):null,deployment:r.deployment&&typeof r.deployment==='object'?{id:text(r.deployment.id,80),status:text(r.deployment.status,40),createdAt:text(r.deployment.createdAt,40)}:null,logsAvailable:r.logsAvailable===true,logsTruncated:r.logsTruncated===true,samples:runtimeSamples((Array.isArray(r.samples)?r.samples:[]).slice(0,100).map((s:unknown)=>({message:JSON.stringify(s)}))),metrics:(Array.isArray(r.metrics)?r.metrics:[]).slice(0,2).filter((m:{measurement:string;average:number;max:number;count:number})=>m&&['CPU_USAGE','MEMORY_USAGE_GB'].includes(m.measurement)&&[m.average,m.max,m.count].every(Number.isFinite)).map((m:{measurement:string;average:number;max:number;count:number})=>({measurement:m.measurement,average:m.average,max:m.max,count:m.count}))}];
 });
}
