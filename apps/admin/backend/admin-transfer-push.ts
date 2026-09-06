import { createSupabaseTransport, type SupabaseConfig } from './supabase';

// Public VAPID key shared with src/push-public-key.ts. The admin deploy is self-contained.
export const ADMIN_TRANSFER_PUSH_PUBLIC_KEY =
  'BFA4-N_J6crmoyUhDEi3TQen1o5_64-P1LEE20f86ODxgghyoG20mNI7DJOBeNfuuKm9FkLAwifb3RsPAcLWZjY';

class AdminTransferPushError extends Error {
  statusCode = 400;
  constructor() {
    super('推播訂閱資料無效，請重新啟用通知');
    this.name = 'AdminTransferPushError';
  }
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
}

export function requireAdminPushEndpoint(value: unknown): string {
  if (typeof value !== 'string' || value.length > 4096 || /[\s\\#]/.test(value)) {
    throw new AdminTransferPushError();
  }
  let url: URL;
  try { url = new URL(value); } catch { throw new AdminTransferPushError(); }
  // Inspect the authority as well: URL.port normalizes an explicit :443 to empty.
  const authority = value.match(/^https:\/\/([^/\?#]+)/)?.[1];
  const host = url.hostname;
  const allowed = host === 'fcm.googleapis.com'
    || host === 'updates.push.services.mozilla.com'
    || host === 'push.services.mozilla.com'
    || host.endsWith('.push.services.mozilla.com')
    || host === 'web.push.apple.com'
    || host.endsWith('.web.push.apple.com')
    || host === 'notify.windows.com'
    || host.endsWith('.notify.windows.com');
  if (!authority || authority.includes(':') || url.protocol !== 'https:'
    || url.username || url.password || url.port || !allowed) {
    throw new AdminTransferPushError();
  }
  return value;
}

function requireKey(value: unknown, byteLength: number): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+$/.test(value)
    || value.length !== Math.ceil(byteLength * 4 / 3)) throw new AdminTransferPushError();
  let bytes: string;
  try { bytes = atob(value.replace(/-/g, '+').replace(/_/g, '/')); }
  catch { throw new AdminTransferPushError(); }
  if (bytes.length !== byteLength || (byteLength === 65 && bytes.charCodeAt(0) !== 4)
    || btoa(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') !== value) {
    throw new AdminTransferPushError();
  }
  return value;
}

export function createAdminTransferPush(
  config: SupabaseConfig | (() => Promise<SupabaseConfig>),
  fetcher?: typeof fetch,
) {
  const supabase = createSupabaseTransport(config, fetcher);
  const ownedEndpointQuery = (adminId: string, endpoint: string) => new URLSearchParams({
    admin_id: `eq.${adminId}`,
    endpoint: `eq.${endpoint}`,
  }).toString();

  return {
    async getConfig(adminId: string, endpoint?: unknown) {
      let enabled = false;
      if (endpoint !== undefined && endpoint !== null) {
        const validatedEndpoint = requireAdminPushEndpoint(endpoint);
        const rows = await supabase.request<Array<{ id: string }>>(
          `/rest/v1/admin_push_subscriptions?${ownedEndpointQuery(adminId, validatedEndpoint)}&enabled=eq.true&select=id&limit=1`,
        );
        enabled = rows.length > 0;
      }
      return { publicKey: ADMIN_TRANSFER_PUSH_PUBLIC_KEY, enabled };
    },

    async enable(adminId: string, input: unknown) {
      const subscription = record(input);
      const endpoint = requireAdminPushEndpoint(subscription.endpoint);
      const keys = record(subscription.keys);
      const p256dh = requireKey(keys.p256dh, 65);
      const authKey = requireKey(keys.auth, 16);
      await supabase.request('/rest/v1/admin_push_subscriptions?on_conflict=endpoint', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify({
          admin_id: adminId, endpoint, p256dh, auth_key: authKey,
          enabled: true, updated_at: new Date().toISOString(),
        }),
      });
      return { enabled: true };
    },

    async disable(adminId: string, input: unknown) {
      const endpoint = requireAdminPushEndpoint(input);
      await supabase.request(`/rest/v1/admin_push_subscriptions?${ownedEndpointQuery(adminId, endpoint)}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ enabled: false, updated_at: new Date().toISOString() }),
      });
      return { enabled: false };
    },
  };
}
