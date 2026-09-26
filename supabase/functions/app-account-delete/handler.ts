import type { AppDeletionResult } from '../../../backend/app-service-contracts.ts';
type Identity = { userId: string; sessionId: string };
type Job = AppDeletionResult & { deletionId: string };
type Dependencies = {
  authenticate(authorization: string): Promise<Identity | null>;
  begin(identity: Identity): Promise<Job>;
  deleteAuth(userId: string): Promise<void>;
  finalize(userId: string, deletionId: string): Promise<AppDeletionResult>;
};
const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });
export function createAppAccountDeleteHandler(deps: Dependencies) {
  return async (request: Request) => {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (request.method !== 'POST') return response({ error: { code: 'METHOD_NOT_ALLOWED' } }, 405);
    try {
      const body = await request.json();
      if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length) return response({ error: { code: 'INVALID_REQUEST' } }, 400);
    } catch { return response({ error: { code: 'INVALID_REQUEST' } }, 400); }
    try {
      const identity = await deps.authenticate(request.headers.get('authorization') ?? '');
      if (!identity) return response({ error: { code: 'AUTH_REQUIRED' } }, 401);
      const job = await deps.begin(identity);
      if (job.status === 'completed' && job.authIdentity === 'retained') return response({ status: 'completed', authIdentity: 'retained' });
      if (job.status !== 'pending' || job.authIdentity !== 'pending' || !job.deletionId) throw new Error('INVALID_DELETION_JOB');
      try { await deps.deleteAuth(identity.userId); }
      catch { return response({ status: 'pending', authIdentity: 'pending' }, 202); }
      // Auth deletion has already succeeded. Lifecycle rows cascade with that
      // identity; a lost final read cannot undo the confirmed deletion.
      try { await deps.finalize(identity.userId, job.deletionId); } catch { /* Safe to retry finalization separately. */ }
      return response({ status: 'completed', authIdentity: 'deleted' });
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      return response({ error: { code: message.includes('AUTH_REQUIRED') ? 'AUTH_REQUIRED' : 'APP_DELETION_UNAVAILABLE' } }, message.includes('AUTH_REQUIRED') ? 401 : 503);
    }
  };
}
