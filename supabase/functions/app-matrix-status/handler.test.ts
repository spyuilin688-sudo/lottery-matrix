import { describe,it,expect,vi } from 'vitest';
import { createAppMatrixStatusEdgeHandler } from './handler.ts';
import { createAppMatrixEntitlementReader } from './source-reader.ts';
import { MatrixAccessError } from '../../../backend/matrix-member-auth.ts';

const entitled={canUseSeven:true,canUseThirteen:true,canUseFullRange:true,canUseTianyan:true,canUseTiangong:true,canViewFullStatus:true};
const request=(token='active',action='summary-batch')=>new Request('https://app.test',{method:'POST',headers:{authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({action,lotteries:['今彩539'],lottery:'今彩539'})});
describe('App status authorization',()=>{
  it('rechecks identity on every summary request and cannot reuse another member response',async()=>{
    const resolveEntitlements=vi.fn(async(token?:string)=>{if(token!=='Bearer active')throw new MatrixAccessError('FORBIDDEN',403);return entitled;});
    const readCompactStatus=vi.fn(async()=>({analysisVersion:'v1',drawPeriod:'42',payload:{lottery:'今彩539',drawPeriod:'42',summary:{total:1},cards:[]}}));
    const handler=createAppMatrixStatusEdgeHandler({resolveEntitlements,readCompactStatus,readStatusSources:async()=>null});
    expect((await handler(request())).status).toBe(200);
    expect((await handler(request('disabled'))).status).toBe(403);
    expect(readCompactStatus).toHaveBeenCalledTimes(1);
    expect(resolveEntitlements).toHaveBeenCalledTimes(2);
  });
  it('keeps retired custom routes unavailable and does not disclose upstream details',async()=>{
    const handler=createAppMatrixStatusEdgeHandler({resolveEntitlements:async()=>{throw new Error('private detail');},readStatusSources:async()=>null});
    const retired=await handler(request('active','custom-save'));
    expect(retired.status).toBe(410);
    const failed=await handler(request());
    expect(failed.status).toBe(502);
    expect(await failed.text()).not.toContain('private detail');
  });
  it('uses App RPC and caller JWT with the anon API key',async()=>{
    const fetcher=vi.fn(async(_input: string | URL | Request,_init?:RequestInit)=>new Response(JSON.stringify(entitled),{status:200}));
    const read=createAppMatrixEntitlementReader(()=>({url:'https://fixture.test',anonKey:'anon'}),fetcher as typeof fetch);
    expect(await read('Bearer member-token')).toEqual(entitled);
    expect(fetcher.mock.calls[0]?.[0]).toBe('https://fixture.test/rest/v1/rpc/app_matrix_entitlements');
    expect(fetcher.mock.calls[0]?.[1]?.headers).toEqual(expect.objectContaining({Authorization:'Bearer member-token',apikey:'anon'}));
  });
});
