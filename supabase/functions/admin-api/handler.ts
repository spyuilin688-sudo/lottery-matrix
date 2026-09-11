import { apiPath, error, json, router, secrets } from './runtime.ts';
import { handler as canonicalHandler } from '../../../apps/admin/backend/index.ts';

// Public configuration is intentionally restricted to the Auth URL/public key.
// All ordinary admin routes continue through the shared credential guards.
const ownerConfig = router({ 'GET /api/owner-auth-config': [async () => {
  const url = (await secrets.readSecret('SUPABASE_URL'))?.trim();
  const publicKey = (await secrets.readSecret('SUPABASE_ANON_KEY'))?.trim();
  if (!url || !publicKey) return error('OWNER_AUTH_CONFIGURATION_UNAVAILABLE', 503);
  return json({ url, publicKey });
}] });

export const handler = (request: Request): Promise<Response> => apiPath(request) === '/api/owner-auth-config'
  ? ownerConfig(request) : canonicalHandler(request);

