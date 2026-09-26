import {it,expect,vi} from 'vitest';
import {createAppNativePushHandler} from './handler.ts';
const env:Record<string,string>={MATRIX_NOTIFICATION_DISPATCH_TOKEN:'test-secret',SUPABASE_URL:'https://fixture.test',SUPABASE_SERVICE_ROLE_KEY:'test-service',FCM_SERVICE_ACCOUNT_JSON:JSON.stringify({project_id:'lottery-matrix-app',client_email:'fixture@lottery-matrix-app.iam.gserviceaccount.com',private_key:'-----BEGIN PRIVATE KEY-----\nAQID\n-----END PRIVATE KEY-----'})};
const request=(secret='test-secret')=>new Request('https://fixture.test',{method:'POST',headers:{'x-matrix-dispatch-token':secret},body:'{}'});
const cryptoFixture={subtle:{importKey:vi.fn(async()=>({})),sign:vi.fn(async()=>new Uint8Array([1,2,3]).buffer)}} as unknown as Crypto;
it('uses only the App queue and makes no FCM request when empty',async()=>{
 const fetcher=vi.fn(async(_input:RequestInfo|URL)=>Response.json([]));
 const result=await createAppNativePushHandler({env:key=>env[key],fetch:fetcher,crypto:cryptoFixture})(request());
 expect(result.status).toBe(200);
 expect(fetcher).toHaveBeenCalledTimes(1);
 expect(fetcher.mock.calls[0]?.[0]).toBe('https://fixture.test/rest/v1/rpc/app_native_notification_claim');
});
it('preserves transport but prepares/finalizes through App RPCs',async()=>{
 const calls:string[]=[];
 const fetcher=vi.fn(async(input:RequestInfo|URL)=>{
  const url=String(input);calls.push(url);
  if(url.endsWith('/app_native_notification_claim'))return Response.json([{delivery_id:'a',claim_id:'b'}]);
  if(url.endsWith('/app_native_notification_prepare'))return Response.json({token:'test-token',notification_payload:{title:'App',body:'Test'}});
  if(url.endsWith('/app_native_notification_finalize'))return Response.json({finalized:true});
  if(url==='https://oauth2.googleapis.com/token')return Response.json({access_token:'test-access',expires_in:3600});
  if(url.startsWith('https://fcm.googleapis.com/'))return Response.json({name:'fixture-message'});
  throw new Error('Unexpected endpoint');
 });
 const result=await createAppNativePushHandler({env:key=>env[key],fetch:fetcher,crypto:cryptoFixture})(request());
 expect(result.status).toBe(200);
 expect((await result.json()).sent).toBe(1);
 expect(calls.filter(url=>url.includes('/rpc/'))).toEqual(['claim','prepare','finalize'].map(name=>`https://fixture.test/rest/v1/rpc/app_native_notification_${name}`));
});
it('rejects an invalid worker secret before queue access',async()=>{
 const fetcher=vi.fn();
 expect((await createAppNativePushHandler({env:key=>env[key],fetch:fetcher,crypto:cryptoFixture})(request('wrong'))).status).toBe(401);
 expect(fetcher).not.toHaveBeenCalled();
});
