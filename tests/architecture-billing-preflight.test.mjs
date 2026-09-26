import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandler } from '../supabase/functions/architecture-billing-preflight/handler.ts';

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
