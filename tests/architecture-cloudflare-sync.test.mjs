import test from 'node:test';
import assert from 'node:assert/strict';
import {cloudflareSnapshot} from '../supabase/functions/architecture-billing-sync/handler.ts';
const now=new Date('2026-09-26T03:00:00Z');
const data={project:{name:'lottery-matrix'},subscriptions:[{rate_plan:{scope:'zone',id:'free'},price:0}],history:[],covered:false,entitlements:[]};
test('empty account billing is not a zero Pages invoice or zero usage',()=>{
 const r=cloudflareSnapshot(data,null,now);
 for(const field of ['currentAmount','estimatedAmount','latestPaymentDate','latestInvoiceAmount','latestInvoiceStatus','period']) assert.equal(r[field],null);
 assert.match(r.source,/帳單紀錄 0 筆/);assert.match(r.source,/不支援/);assert.match(r.source,/不是 Pages/);
 assert.equal(r.verifiedAt,now.toISOString());
});
test('account invoice amount is explicitly scoped and payment dates are not invented',()=>{
 const r=cloudflareSnapshot({...data,history:[{amount:12.5,currency:'USD',status:'paid',occurred_at:'2026-09-20T00:00:00Z'}]},null,now);
 assert.equal(r.latestInvoiceAmount,null); assert.match(r.source,/帳單紀錄 1 筆/);
 assert.equal(r.latestInvoiceStatus,null); assert.equal(r.latestPaymentDate,null);
});
test('reject malformed provider data and preserve separate manual provenance',()=>{
 const account={verifiedAt:'2026-09-20T00:00:00Z'};
 assert.deepEqual(cloudflareSnapshot(data,{account},now).account,account);
 for(const bad of [{...data,project:{}},{...data,covered:null},{...data,history:null}]) assert.throws(()=>cloudflareSnapshot(bad,null,now));
});

test('daily integration reads Cloudflare once per endpoint and persists through the existing completion',async()=>{
 const {createSyncHandler}=await import('../supabase/functions/architecture-billing-sync/handler.ts');
 const calls=[];let saved;
 const h=createSyncHandler({now:()=>now,getEnv:n=>({MATRIX_NOTIFICATION_DISPATCH_TOKEN:'dispatch',SUPABASE_URL:'https://db.test',SUPABASE_SERVICE_ROLE_KEY:'server',CLOUDFLARE_BILLING_API_TOKEN:'cf'})[n],fetch:async(url,init)=>{
 calls.push(url);
 if(url.endsWith('claim_admin_architecture_billing_run'))return Response.json('run');
 if(url.includes('/rest/v1/admin_architecture_subscriptions'))return Response.json([]);
 if(url.endsWith('/pages/projects/lottery-matrix'))return Response.json({success:true,result:data.project});
 if(url.endsWith('/entitlements'))return Response.json({success:true,result:[{id:'pages.concurrent_builds',allocation:{type:'max_count',value:1}}]});
 if(url.endsWith('/subscriptions'))return Response.json({success:true,result:data.subscriptions});
 if(url.includes('/billing/history?'))return Response.json({success:true,result:[]});
 if(url.endsWith('/billable-usage/info'))return Response.json({success:true,result:{covered:false}});
 if(url.endsWith('finish_admin_architecture_billing_run')){saved=JSON.parse(init.body);return Response.json(true);}
 throw Error('unexpected');
 }});
 const response=await h(new Request('https://test',{method:'POST',headers:{'x-matrix-dispatch-token':'dispatch'},body:'{}'}));
 assert.equal((await response.json()).status,'partial');
 assert.equal(saved.p_results.cloudflare.status,'partial');
 assert.equal(saved.p_results.cloudflare.snapshot.currentAmount,null);
 assert.equal(calls.filter(u=>u.includes('api.cloudflare.com')).length,5);
 assert.equal(new Set(calls).size,calls.length);
});


test('Cloudflare limits use actual active allocations without inventing monthly usage or plan',()=>{
 const entitlements=[
  {id:'pages.concurrent_builds',allocation:{type:'max_count',value:1}},
  {id:'pages.custom_domains_per_project',allocation:{type:'max_count',value:100}},
  {id:'pages.build_cache_storage_limit_mb',allocation:{type:'max_count',value:10000}},
  {id:'pages.build_cache_retention_limit_days',allocation:{type:'max_count',value:7}},
  {id:'filters.max_lists',allocation:{type:'max_count',value:1}},
  {id:'pages.concurrent_builds',deleted_date:'2020-01-01',allocation:{type:'max_count',value:99}},
 ];
 const r=cloudflareSnapshot({...data,entitlements},null,now);
 assert.deepEqual(r.limits,[{label:'同時建置',value:'1 個'},{label:'每專案自訂網域',value:'100 個'},{label:'建置快取容量',value:'10,000 MB'},{label:'建置快取保留時間',value:'7 天'}]);
 assert.equal(r.currentAmount,null);
 assert.equal(r.account,undefined);
 assert.ok(!JSON.stringify(r.limits).includes('500'));
 for(const bad of [null,[{id:'pages.concurrent_builds',allocation:{type:'max_count',value:-1}}],[{id:'pages.concurrent_builds',allocation:{type:'max_count',value:'1'}}]])assert.throws(()=>cloudflareSnapshot({...data,entitlements:bad},null,now));
});
