import { createAppAccountDeleteHandler } from './handler.ts';
const required = (name: string) => { const value = Deno.env.get(name)?.trim(); if (!value) throw new Error('SUPABASE_CONFIG_MISSING'); return value; };
const url = required('SUPABASE_URL').replace(/\/+$/, '');
const service = required('SUPABASE_SERVICE_ROLE_KEY');
const anon = required('SUPABASE_ANON_KEY');
async function rpc<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const response = await fetch(`${url}/rest/v1/rpc/${name}`, { method: 'POST', headers: { apikey: service, Authorization: `Bearer ${service}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(15000) });
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.message === 'AUTH_REQUIRED' ? 'AUTH_REQUIRED' : 'APP_DELETION_UNAVAILABLE');
  }
  return response.json();
}
Deno.serve(createAppAccountDeleteHandler({
  async authenticate(authorization) {
    if (!/^Bearer [^\s]+$/i.test(authorization)) return null;
    const response = await fetch(`${url}/auth/v1/user`, { headers: { apikey: anon, Authorization: authorization }, signal: AbortSignal.timeout(10000) });
    if (response.status === 401 || response.status === 403) return null;
    if (!response.ok) throw new Error('AUTH_UNAVAILABLE');
    const user = await response.json();
    try {
      // Claims are only inspected after GoTrue has verified this exact token.
      const payload = authorization.split(' ')[1].split('.')[1];
      const claims = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(payload.length/4)*4, '=')));
      const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuid.test(user.id) || claims.sub !== user.id || !uuid.test(claims.session_id)) return null;
      return { userId: user.id, sessionId: claims.session_id };
    } catch { return null; }
  },
  begin: ({ userId, sessionId }) => rpc('app_account_deletion_begin', { p_user_id: userId, p_session_id: sessionId }),
  async deleteAuth(userId) {
    const response = await fetch(`${url}/auth/v1/admin/users/${encodeURIComponent(userId)}`, { method: 'DELETE', headers: { apikey: service, Authorization: `Bearer ${service}` }, signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error('AUTH_DELETION_PENDING');
  },
  finalize: (userId, deletionId) => rpc('app_account_deletion_finalize', { p_user_id: userId, p_deletion_id: deletionId }),
}));
