import { createMatrixStatusEdgeHandler } from '../matrix-status/handler.ts';
import { MatrixAccessError } from '../../../backend/matrix-member-auth.ts';

type Dependencies = Parameters<typeof createMatrixStatusEdgeHandler>[0];
const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS','Content-Type':'application/json; charset=utf-8'};

export function createAppMatrixStatusEdgeHandler(dependencies: Dependencies) {
  return async (request: Request) => {
    if(request.method==='OPTIONS') return new Response(null,{status:204,headers});
    if(request.method!=='POST') return new Response(JSON.stringify({error:{code:'METHOD_NOT_ALLOWED'}}),{status:405,headers});
    let body: unknown;
    try { body=await request.clone().json(); }
    catch { return new Response(JSON.stringify({error:{code:'INVALID_REQUEST'}}),{status:400,headers}); }
    if(body && typeof body==='object' && 'action' in body && ['custom-save','custom-reset','recompute'].includes(String(body.action))) {
      return new Response(JSON.stringify({error:{code:'CUSTOM_STATUS_RETIRED'}}),{status:410,headers});
    }
    try {
      const entitlements=await dependencies.resolveEntitlements(request.headers.get('authorization') ?? undefined);
      // Authorize even summary/identity requests. Do not retain a member-specific
      // response between requests; underlying canonical read data remains shared.
      return await createMatrixStatusEdgeHandler({...dependencies,resolveEntitlements:async()=>entitlements})(request);
    } catch(cause) {
      const status=cause instanceof MatrixAccessError ? cause.status : 502;
      const code=cause instanceof MatrixAccessError ? cause.code : 'SUPABASE_ENTITLEMENTS_READ_FAILED';
      return new Response(JSON.stringify({error:{code}}),{status,headers});
    }
  };
}
