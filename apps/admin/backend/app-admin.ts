import { AdminAccessError } from './admin-auth';
import { isPrivateActivationOwner } from './private-activation';
import type { AppRevenueReport } from '../../../backend/app-service-contracts';
type Actor = { id: string; account: string; role: string; status: string };
type Transport = { supabaseRequest<T = unknown>(path: string, init?: RequestInit): Promise<T> };
export function canManageApp(actor: Actor | null | undefined) {
  return Boolean(actor && actor.status === '啟用' && isPrivateActivationOwner(actor));
}
export function createAppAdmin(transport: Transport) {
  const requireOwner = (actor: Actor) => { if (!canManageApp(actor)) throw new AdminAccessError('APP_ADMIN_FORBIDDEN', 403); };
  const request = async <T>(name: string, body: Record<string, unknown>, actor: Actor): Promise<T> => {
    requireOwner(actor);
    try { return await transport.supabaseRequest<T>(`rpc/${name}`, { method: 'POST', body: JSON.stringify({ p_actor_id: actor.id, ...body }) }); }
    catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('APP_REVISION_CONFLICT')) throw new AdminAccessError('APP_REVISION_CONFLICT', 409);
      if (message.includes('APP_MEMBER_NOT_FOUND')) throw new AdminAccessError('APP_MEMBER_NOT_FOUND', 404);
      throw error;
    }
  };
  return {
    async list(view: 'users' | 'subscriptions', query: Record<string, string>, actor: Actor) {
      requireOwner(actor);
      const page = Number(query.page ?? 1), pageSize = Number(query.pageSize ?? 25), keyword = (query.keyword ?? '').trim();
      if (!Number.isSafeInteger(page) || page<1 || page>1000000 || !Number.isSafeInteger(pageSize) || pageSize<1 || pageSize>100 || keyword.length>200) throw new AdminAccessError('APP_ADMIN_INVALID_QUERY', 400);
      return request('app_admin_list', { p_view: view, p_page: page, p_page_size: pageSize, p_query: keyword }, actor);
    },
    async setStatus(id: string, body: Record<string, unknown>, actor: Actor) {
      requireOwner(actor);
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) || !['active','disabled'].includes(String(body.status)) || !Number.isSafeInteger(body.expectedRevision) || Number(body.expectedRevision)<1) throw new AdminAccessError('APP_ADMIN_INVALID_STATUS', 400);
      return request('app_admin_set_status', { p_member_id: id, p_status: body.status, p_expected_revision: body.expectedRevision }, actor);
    },
    async revenue(actor: Actor): Promise<AppRevenueReport> { return request('app_admin_revenue', {}, actor); },
  };
}
