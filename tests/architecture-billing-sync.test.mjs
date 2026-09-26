import test from 'node:test';
import assert from 'node:assert/strict';
import { githubSnapshot, railwaySnapshot, createSyncHandler } from '../supabase/functions/architecture-billing-sync/handler.ts';

const now = new Date('2026-09-26T01:00:00Z');
test('GitHub uses net usage and keeps the original provenance of manual payment data', () => {
  const previous={latestInvoiceAmount:'US$2.00',latestInvoiceStatus:'paid',latestPaymentDate:'2026-09-18',verifiedAt:'2026-09-25T00:00:00Z'};
  const result=githubSnapshot({usageItems:[{netAmount:1.12},{netAmount:2.23}]},previous,now);
  assert.equal(result.currentAmount,'US$3.35（折抵後用量；不含方案費）');
  assert.equal(result.period,'2026-09-01－2026-09-30');
  assert.equal(result.latestPaymentDate,'2026-09-18');
  assert.match(result.source,/2026-09-25/);
  assert.equal(githubSnapshot({usageItems:[]},null,now).currentAmount,'US$0.00（折抵後用量；不含方案費）');
  assert.throws(()=>githubSnapshot({usageItems:[{netAmount:null}]},null,now));
});
const railway={workspace:{id:'8b32b524-e3de-4ad2-a37d-4d641bca491a',customer:{currentUsage:25,billingPeriod:{start:'2026-09-01T00:00:00Z',end:'2026-10-01T00:00:00Z'},subscriptions:[{status:'active',nextInvoiceCurrentTotal:3000}],invoices:[{total:2000,status:'paid',periodStart:'1756684800',periodEnd:'1759276800'}]}},agentUsage:{totalUsedCents:1000,billingPeriodEnd:'2026-10-01T00:00:00Z'},usage:[{measurement:'MEMORY_USAGE_GB',value:43200}],estimatedUsage:[{measurement:'MEMORY_USAGE_GB',estimatedValue:86400}]};
test('daily usage sync retains separately verified account quotas and their original date',()=>{
  const account={paymentDate:null,paymentAmount:'US$18.60',paymentKind:'estimate',verifiedAt:'2026-09-25T00:00:00Z',source:'Provider dashboard',quotas:[{label:'Included credit',included:'US$20',used:'US$20',remaining:'US$0',reset:'Billing period'}],costs:[]};
  for(const snapshot of [githubSnapshot({usageItems:[]},{account},now),railwaySnapshot(railway,now,{account})]) {
    assert.deepEqual(snapshot.account,account);
    assert.notEqual(snapshot.account.verifiedAt,snapshot.verifiedAt);
  }
  assert.equal(Object.hasOwn(githubSnapshot({usageItems:[]},null,now),'account'),false);
  assert.equal(Object.hasOwn(railwaySnapshot(railway,now),'account'),false);
});
test('Railway distinguishes dollar usage from cents in invoice totals and does not invent payment dates',()=>{
  const result=railwaySnapshot(railway,now);
  assert.equal(result.currentAmount,'US$35.00（折抵前用量；待出帳快照 US$30.00）');
  assert.equal(result.latestInvoiceAmount,'US$20.00');
  assert.equal(result.estimatedAmount,'US$45.00（折抵前用量預估）');
  assert.equal(result.latestPaymentDate,null);
  assert.equal(result.latestInvoiceStatus,'paid');
  assert.throws(()=>railwaySnapshot({...railway,workspace:{...railway.workspace,id:'other'}},now));
  assert.throws(()=>railwaySnapshot({...railway,agentUsage:{...railway.agentUsage,billingPeriodEnd:'2026-11-01T00:00:00Z'}},now));
});
test('authentication rejects before storage and provider calls',async()=>{
  let count=0;
  const h=createSyncHandler({getEnv:()=>undefined,fetch:async()=>{count++;throw Error();},now:()=>now});
  assert.equal((await h(new Request('https://test',{method:'POST'}))).status,401);
  assert.equal(count,0);
});
const env={MATRIX_NOTIFICATION_DISPATCH_TOKEN:'dispatch',SUPABASE_URL:'https://db.test',SUPABASE_SERVICE_ROLE_KEY:'server',GITHUB_ACTIONS_TOKEN:'github',RAILWAY_BILLING_API_TOKEN:'railway'};
const request=()=>new Request('https://test',{method:'POST',headers:{'x-matrix-dispatch-token':'dispatch'},body:'{}'});
test('Railway keeps verified historical payment separate when the latest invoice changes',()=>{
  const previous={latestInvoiceAmount:'US$17.00',latestInvoiceStatus:'paid',latestPaymentDate:'2026-08-25',source:'Verified payment receipt',verifiedAt:'2026-09-20T00:00:00Z'};
  const result=railwaySnapshot(railway,now,previous);
  assert.equal(result.latestInvoiceAmount,'US$20.00');
  assert.equal(result.latestPaymentDate,null);
  assert.equal(result.manualPayment.paymentDate,'2026-08-25');
  assert.equal(result.manualPayment.amount,'US$17.00');
  assert.match(result.source,/人工核對付款：2026-08-25 US\$17.00/);
  assert.deepEqual(railwaySnapshot(railway,now,result).manualPayment,result.manualPayment);
  assert.ok(result.source.length<=200);
});
for(const successful of [0,1,2]) test(`sync reports the true outcome when ${successful} providers succeed`,async()=>{
  const h=createSyncHandler({getEnv:n=>env[n],now:()=>now,fetch:async(url)=>{
    if(url.endsWith('claim_admin_architecture_billing_run'))return Response.json('run-id');
    if(url.includes('/rest/v1/admin_architecture_subscriptions'))return Response.json([]);
    if(url.includes('api.github.com'))return successful>0 ? Response.json({usageItems:[]}) : new Response('',{status:503});
    if(url.includes('backboard.railway.com'))return successful>1 ? Response.json({data:railway}) : new Response('',{status:503});
    if(url.endsWith('finish_admin_architecture_billing_run'))return Response.json(true);
    throw Error('unexpected');
  }});
  const response=await h(request());
  assert.equal((await response.json()).status,['failed','partial','partial'][successful]);
});
test('storage interruption closes the claimed run without retrying provider requests',async()=>{
  const calls=[];
  const h=createSyncHandler({getEnv:n=>env[n],now:()=>now,fetch:async(url,init)=>{
    calls.push(url);
    if(url.endsWith('claim_admin_architecture_billing_run'))return Response.json('run-id');
    if(url.includes('/rest/v1/admin_architecture_subscriptions'))throw Error('private storage error');
    if(url.endsWith('fail_admin_architecture_billing_run')){assert.deepEqual(JSON.parse(init.body),{p_run_id:'run-id'});return Response.json(true);}
    throw Error('unexpected');
  }});
  const response=await h(request());
  assert.equal(response.status,503);
  assert.deepEqual(await response.json(),{error:'SYNC_STORAGE_FAILED'});
  assert.equal(calls.filter(x=>x.endsWith('fail_admin_architecture_billing_run')).length,1);
  assert.equal(calls.some(x=>/api.github.com|backboard.railway.com/.test(x)),false);
});
test('duplicate daily invocation does not call providers',async()=>{
  let count=0;
  const h=createSyncHandler({getEnv:n=>env[n],now:()=>now,fetch:async url=>{count++; assert.match(url,/claim_admin_architecture_billing_run$/); return Response.json(null);}});
  assert.equal((await (await h(request())).json()).status,'already_claimed');
  assert.equal(count,1);
});
test('preview retains stored payment provenance and never claims or writes a run',async()=>{
  const manualPayment={paymentDate:'2026-08-25',amount:'US$17.00',verifiedAt:'2026-09-20T00:00:00Z',source:'Verified receipt'};
  const h=createSyncHandler({getEnv:n=>env[n],now:()=>now,fetch:async(url)=>{
    if(url.includes('/rest/v1/admin_architecture_subscriptions'))return Response.json([{provider:'railway',billing_snapshot:{manualPayment}}]);
    if(url.includes('api.github.com'))return Response.json({usageItems:[]});
    if(url.includes('backboard.railway.com'))return Response.json({data:railway});
    assert.fail('preview attempted a database write');
  }});
  const response=await h(new Request('https://test',{method:'POST',headers:{'x-matrix-dispatch-token':'dispatch'},body:'{"dryRun":true}'}));
  const result=await response.json();
  assert.equal(result.status,'preview');
  assert.deepEqual(result.results.railway.snapshot.manualPayment,manualPayment);
});
test('failure to close an interrupted run remains a redacted storage error',async()=>{
  const h=createSyncHandler({getEnv:n=>env[n],now:()=>now,fetch:async(url)=>{
    if(url.endsWith('claim_admin_architecture_billing_run'))return Response.json('run-id');
    throw Error('private unavailable database');
  }});
  const response=await h(request());
  assert.equal(response.status,503);
  assert.deepEqual(await response.json(),{error:'SYNC_STORAGE_FAILED'});
});
test('one provider failure preserves that snapshot while other provider succeeds; errors are redacted',async()=>{
  let finish;
  const h=createSyncHandler({getEnv:n=>env[n],now:()=>now,fetch:async(url,init)=>{
    if(url.endsWith('claim_admin_architecture_billing_run'))return Response.json('run-id');
    if(url.includes('/rest/v1/admin_architecture_subscriptions'))return Response.json([]);
    if(url.includes('api.github.com'))return Response.json({usageItems:[{netAmount:3}]});
    if(url.includes('backboard.railway.com'))return Response.json({errors:[{message:'railway private secret'}]});
    if(url.endsWith('finish_admin_architecture_billing_run')){finish=JSON.parse(init.body);return Response.json(true);}
    throw Error('unexpected');
  }});
  const response=await h(request());const result=await response.text();
  assert.equal(response.status,200);
  assert.equal(finish.p_results.github.status,'synced');
  assert.equal(finish.p_results.railway.status,'failed');
  assert.equal(finish.p_results.railway.snapshot,undefined);
  assert.ok(!result.includes('private')&&!result.includes('secret'));
});
