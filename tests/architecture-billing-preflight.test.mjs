import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandler } from '../supabase/functions/architecture-billing-preflight/handler.ts';

test('optional Pages diagnostic checks account scope without exposing project secrets', async () => {
  const urls=[];
  const handler=createHandler({getEnv:n=>({MATRIX_NOTIFICATION_DISPATCH_TOKEN:'expected',CLOUDFLARE_BILLING_API_TOKEN:'cf-secret'})[n],fetch:async url=>{
    urls.push(url);
    if(url.endsWith('/pages/projects/lottery-matrix')) return Response.json({success:true,result:{name:'lottery-matrix',deployment_configs:{production:{env_vars:{PRIVATE:'secret-value'}}}}});
    return Response.json({success:true,result:[]});
  }});
  const response=await handler(new Request('https://example.test',{method:'POST',headers:{'x-matrix-dispatch-token':'expected'},body:JSON.stringify({cloudflareDetails:true})}));
  const result=await response.text();
  assert.equal(JSON.parse(result).cloudflare.pages.status,'readable');
  assert.ok(urls.some(url=>url.endsWith('/accounts/2a0ab3c9c14b3d669c035efa1bc60fe4/subscriptions')));
  assert.ok(!result.includes('PRIVATE')&&!result.includes('secret-value')&&!result.includes('cf-secret'));
});

test('rejects unauthorized requests without calling provider APIs', async () => {
  let calls=0;
  const handler=createHandler({getEnv:n=>n==='MATRIX_NOTIFICATION_DISPATCH_TOKEN'?'expected':undefined,fetch:async()=>{calls++;throw Error('unexpected');}});
  const response=await handler(new Request('https://example.test',{method:'POST'}));
  assert.equal(response.status,401);
  assert.equal(calls,0);
});

test('reports missing credentials without calling provider APIs', async () => {
  const handler=createHandler({getEnv:n=>n==='MATRIX_NOTIFICATION_DISPATCH_TOKEN'?'expected':undefined,fetch:async()=>{throw Error('unexpected');}});
  const response=await handler(new Request('https://example.test',{method:'POST',headers:{'x-matrix-dispatch-token':'expected'}}));
  const result=await response.json();
  assert.equal(result.cloudflare.status,'missing_credential');
  assert.equal(result.github.status,'missing_credential');
  assert.equal(result.railway.status,'missing_billing_credential');
  assert.equal(result.supabase.status,'missing_billing_credential');
});

test('never returns provider credentials or private provider response bodies', async () => {
  const handler=createHandler({getEnv:n=>({MATRIX_NOTIFICATION_DISPATCH_TOKEN:'expected',CLOUDFLARE_BILLING_API_TOKEN:'secret-cf',GITHUB_ACTIONS_TOKEN:'secret-gh'})[n],fetch:async()=>new Response(JSON.stringify({success:false,errors:[{code:10000,message:'secret-cf private'}],message:'secret-gh private'}),{status:403})});
  const response=await handler(new Request('https://example.test',{method:'POST',headers:{'x-matrix-dispatch-token':'expected'}}));
  const result=await response.text();
  assert.ok(!result.includes('secret-cf')&&!result.includes('secret-gh')&&!result.includes('private'));
  assert.equal(JSON.parse(result).github.httpStatus,403);
});

test('Railway confirms billing access without exposing billing data or credentials', async () => {
  const handler=createHandler({getEnv:n=>({MATRIX_NOTIFICATION_DISPATCH_TOKEN:'expected',RAILWAY_BILLING_API_TOKEN:'railway-secret'})[n],fetch:async(url,init)=>{
    assert.equal(url,'https://backboard.railway.com/graphql/v2');
    assert.equal(init.headers.Authorization,'Bearer railway-secret');
    assert.equal(init.redirect,'error');
    assert.match(JSON.parse(init.body).query,/currentUsage/);
    return new Response(JSON.stringify({data:{workspace:{id:'8b32b524-e3de-4ad2-a37d-4d641bca491a',customer:{currentUsage:123.45,billingPeriod:{start:'2026-09-01',end:'2026-10-01'},invoices:[{total:98765,status:'paid'}],subscriptions:[{nextInvoiceCurrentTotal:98765}]}}}}));
  }});
  const response=await handler(new Request('https://example.test',{method:'POST',headers:{'x-matrix-dispatch-token':'expected'}}));
  const text=await response.text();
  assert.deepEqual(JSON.parse(text).railway,{status:'readable',httpStatus:200,invoiceCount:1,subscriptionCount:1});
  assert.ok(!text.includes('railway-secret')&&!text.includes('98765')&&!text.includes('123.45'));
});

test('Railway rejects GraphQL errors even with HTTP 200 and does not leak errors', async () => {
  const handler=createHandler({getEnv:n=>({MATRIX_NOTIFICATION_DISPATCH_TOKEN:'expected',RAILWAY_BILLING_API_TOKEN:'railway-secret'})[n],fetch:async()=>new Response(JSON.stringify({errors:[{message:'private details'}],data:{workspace:null}}))});
  const response=await handler(new Request('https://example.test',{method:'POST',headers:{'x-matrix-dispatch-token':'expected'}}));
  assert.deepEqual((await response.json()).railway,{status:'api_rejected',httpStatus:200});
});

test('unpaid invoice diagnostic allowlists amounts and never exposes invoice links', async () => {
  for (const rejected of [false,true]) {
    const handler=createHandler({getEnv:n=>({MATRIX_NOTIFICATION_DISPATCH_TOKEN:'expected',CLOUDFLARE_BILLING_API_TOKEN:'private-token'})[n],fetch:async url=>{
      if(url.endsWith('/billing/unpaid-invoice')) return Response.json(rejected
        ? {errors:[{code:7003,message:'private-token private-details'},{code:'private-details'}]}
        : {success:true,result:{invoices:[{amount_to_pay:12.5,currency:'USD',hosted_invoice_url:'private-details',invoice_id:'private-details'}]}}, {status:rejected?400:200});
      return Response.json({success:true,result:[]});
    }});
    const response=await handler(new Request('https://example.test',{method:'POST',headers:{'x-matrix-dispatch-token':'expected'},body:JSON.stringify({cloudflareDetails:true})}));
    const raw=await response.text();
    assert.ok(!raw.includes('private-token')&&!raw.includes('private-details'));
    assert.deepEqual(JSON.parse(raw).cloudflare.unpaidInvoices,rejected
      ? {status:'api_rejected',httpStatus:400,codes:[7003]}
      : {status:'readable',httpStatus:200,unpaid:[{amountToPay:12.5,currency:'USD'}]});
  }
});
