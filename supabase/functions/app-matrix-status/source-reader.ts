import type { AppEntitlements } from '../../../backend/app-service-contracts.ts';
import { MatrixAccessError } from '../../../backend/matrix-member-auth.ts';

export function createAppMatrixEntitlementReader(
  loadConfig: () => { url: string; anonKey: string },
  fetcher: typeof fetch = fetch,
) {
  return async (authorization?: string): Promise<AppEntitlements> => {
    const config=loadConfig();
    const response=await fetcher(`${config.url}/rest/v1/rpc/app_matrix_entitlements`,{
      method:'POST',headers:{apikey:config.anonKey,Authorization:authorization || `Bearer ${config.anonKey}`,'Content-Type':'application/json'},body:'{}',
    });
    if(response.status===401) throw new MatrixAccessError('AUTH_REQUIRED',401);
    if(response.status===403) throw new MatrixAccessError('FORBIDDEN',403);
    if(!response.ok) throw new Error('SUPABASE_ENTITLEMENTS_READ_FAILED');
    const result=await response.json();
    const keys=['canUseSeven','canUseThirteen','canUseFullRange','canUseTianyan','canUseTiangong','canViewFullStatus'];
    if(!result || keys.some(key=>typeof result[key]!=='boolean')) throw new Error('SUPABASE_ENTITLEMENTS_READ_FAILED');
    return result as AppEntitlements;
  };
}
