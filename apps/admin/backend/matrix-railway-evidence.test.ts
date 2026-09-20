import {expect,it,vi} from 'vitest';
import {createRailwayEvidenceCollector,runtimeSamples,MATRIX_SERVICES} from './matrix-railway-evidence';
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

const attributeLog = {
 timestamp:'2026-09-19T18:53:40Z', message:'',
 attributes:[
  {key:'lottery',value:'"今彩539"'}, {key:'period',value:'"115000228"'},
  {key:'outcome',value:'"already-acquired"'}, {key:'durationMs',value:'3943.901'},
  {key:'finishedAt',value:'"2026-09-19T18:53:32.956364+00:00"'},
  {key:'executionVersion',value:'"worker-version"'}, {key:'token',value:'"secret"'},
 ],
};
it('reads Railway extracted attributes without retaining unrelated fields',()=>{
 expect(runtimeSamples([attributeLog])).toEqual([{
  lottery:'今彩539',period:'115000228',outcome:'already-acquired',durationMs:3943.901,
  finishedAt:'2026-09-19T18:53:32.956364+00:00',executionVersion:'worker-version',
 }]);
});
it('rejects invalid attribute samples and tolerates malformed log JSON',()=>{
 expect(runtimeSamples([{...attributeLog,message:'not JSON'},
  {...attributeLog,attributes:[...attributeLog.attributes,{key:'durationMs',value:'-1'}]},
  {...attributeLog,attributes:[...attributeLog.attributes,{key:'period',value:'"invalid"'}]},
 ])).toHaveLength(1);
});
it('requests extracted fields from Railway and returns usable runtime evidence',async()=>{
 const fetcher = (async (_url:unknown,init:RequestInit) => {
  const {query} = JSON.parse(String(init.body));
  const data = query.includes('serviceInstances') ? {environment:{serviceInstances:{edges:
   Object.values(MATRIX_SERVICES).map(serviceId=>({node:{serviceId,latestDeployment:{id:serviceId,status:'SUCCESS',createdAt:attributeLog.timestamp}}}))}}}
   : query.includes('deploymentLogs') ? {deploymentLogs:[query.includes('attributes')?attributeLog:{timestamp:attributeLog.timestamp,message:''}]}
   : {metrics:[]};
  return new Response(JSON.stringify({data}));
 }) as typeof fetch;
 const result=await createRailwayEvidenceCollector(async()=>({projectToken:'test-only'}),fetcher)(new Date('2026-09-19T19:00:00Z'));
 expect(result[0].samples[0]).toMatchObject({period:'115000228',durationMs:3943.901});
 expect(result.every(r=>r.logsAvailable)).toBe(true);
});
