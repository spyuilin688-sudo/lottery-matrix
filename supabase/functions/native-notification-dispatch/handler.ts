type Dependencies = {
  env: (key: string) => string | undefined;
  fetch: typeof fetch;
  crypto: Crypto;
};

type Claim = { delivery_id: string; claim_id: string };
type Prepared = {
  token: string;
  notification_payload: { title: string; body: string; url?: string; tag?: string };
};
type Outcome = 'sent' | 'retry' | 'failed' | 'unregistered';

const PROJECT = 'lottery-matrix-app';
const OAUTH_URL = 'https://oauth2.googleapis.com/token';

function base64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function encodedJson(value: unknown): string {
  return base64url(new TextEncoder().encode(JSON.stringify(value)));
}

function reply(status: number, body: unknown): Response {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

function secretMatches(actual: string, expected: string): boolean {
  let difference = actual.length ^ expected.length;
  for (let index = 0; index < Math.max(actual.length, expected.length); index += 1) {
    difference |= (actual.charCodeAt(index) || 0) ^ (expected.charCodeAt(index) || 0);
  }
  return difference === 0;
}

async function accessToken(raw: string, deps: Dependencies): Promise<string> {
  const account = JSON.parse(raw);
  if (
    account.project_id !== PROJECT
    || typeof account.client_email !== 'string'
    || !account.client_email.endsWith(`@${PROJECT}.iam.gserviceaccount.com`)
    || typeof account.private_key !== 'string'
  ) {
    throw new Error('FCM_NOT_CONFIGURED');
  }
  const pem = account.private_key
    .replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, '');
  const key = await deps.crypto.subtle.importKey(
    'pkcs8',
    Uint8Array.from(atob(pem), character => character.charCodeAt(0)),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${encodedJson({ alg: 'RS256', typ: 'JWT' })}.${encodedJson({
    iss: account.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: OAUTH_URL,
    iat: now,
    exp: now + 3600,
  })}`;
  const signature = await deps.crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(unsigned),
  );
  const response = await deps.fetch(OAUTH_URL, {
    method: 'POST',
    signal: AbortSignal.timeout(8000),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${unsigned}.${base64url(new Uint8Array(signature))}`,
    }),
  });
  if (!response.ok) throw new Error('FCM_AUTH_FAILED');
  const result = await response.json();
  if (
    typeof result.access_token !== 'string'
    || !result.access_token
    || !(result.expires_in > 120)
  ) {
    throw new Error('FCM_AUTH_FAILED');
  }
  return result.access_token;
}

async function send(prepared: Prepared, bearer: string, deps: Dependencies): Promise<Outcome> {
  const payload = prepared.notification_payload;
  if (
    !prepared.token
    || !payload
    || typeof payload.title !== 'string'
    || typeof payload.body !== 'string'
  ) {
    return 'failed';
  }
  const data: Record<string, string> = {};
  if (typeof payload.url === 'string') data.url = payload.url;
  if (typeof payload.tag === 'string') data.tag = payload.tag;
  try {
    const response = await deps.fetch(
      `https://fcm.googleapis.com/v1/projects/${PROJECT}/messages:send`,
      {
        method: 'POST',
        signal: AbortSignal.timeout(10000),
        headers: { Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: {
            token: prepared.token,
            notification: { title: payload.title, body: payload.body },
            data,
            android: {
              priority: 'high',
              notification: {
                channel_id: 'matrix_notifications',
                ...(payload.tag ? { tag: payload.tag } : {}),
              },
            },
          },
        }),
      },
    );
    if (response.ok) return 'sent';
    const body = await response.json().catch(() => ({}));
    const details: unknown = body?.error?.details;
    if (
      Array.isArray(details)
      && details.some(detail => (
        detail?.['@type'] === 'type.googleapis.com/google.firebase.fcm.v1.FcmError'
        && detail.errorCode === 'UNREGISTERED'
      ))
    ) {
      return 'unregistered';
    }
    return response.status === 429 || response.status === 401 || response.status >= 500
      ? 'retry'
      : 'failed';
  } catch {
    return 'retry';
  }
}

export function createNativePushHandler(
  deps: Dependencies,
): (request: Request) => Promise<Response> {
  return async (request: Request): Promise<Response> => {
    if (request.method !== 'POST') return reply(405, { error: 'METHOD_NOT_ALLOWED' });
    const secret = deps.env('MATRIX_NOTIFICATION_DISPATCH_TOKEN');
    if (!secret) return reply(503, { error: 'NATIVE_PUSH_NOT_CONFIGURED' });
    if (!secretMatches(request.headers.get('x-matrix-dispatch-token') ?? '', secret)) {
      return reply(401, { error: 'UNAUTHORIZED' });
    }
    const url = deps.env('SUPABASE_URL');
    const serviceKey = deps.env('SUPABASE_SERVICE_ROLE_KEY');
    const account = deps.env('FCM_SERVICE_ACCOUNT_JSON');
    if (!url || !serviceKey || !account) {
      return reply(503, { error: 'NATIVE_PUSH_NOT_CONFIGURED' });
    }

    async function rpc<T>(name: string, args: unknown): Promise<T> {
      const response = await deps.fetch(`${url!.replace(/\/$/, '')}/rest/v1/rpc/${name}`, {
        method: 'POST',
        signal: AbortSignal.timeout(8000),
        headers: {
          apikey: serviceKey!,
          Authorization: `Bearer ${serviceKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(args),
      });
      if (!response.ok) throw new Error('NATIVE_QUEUE_UNAVAILABLE');
      return await response.json() as T;
    }

    let claims: Claim[];
    try {
      claims = await rpc<Claim[]>('native_notification_claim', { p_limit: 20 });
    } catch {
      return reply(503, { error: 'NATIVE_QUEUE_UNAVAILABLE' });
    }
    if (!Array.isArray(claims) || claims.length > 20) {
      return reply(503, { error: 'NATIVE_QUEUE_INVALID_RESPONSE' });
    }

    const result = {
      claimed: claims.length,
      sent: 0,
      retry: 0,
      failed: 0,
      unregistered: 0,
      canceled: 0,
      stale: 0,
      errors: 0,
    };
    if (claims.length === 0) return reply(200, result);

    // FCM credentials are only needed once there is actual queue work.
    let bearer: string;
    try {
      bearer = await accessToken(account, deps);
    } catch {
      return reply(503, { error: 'FCM_CREDENTIALS_UNAVAILABLE' });
    }

    let cursor = 0;
    await Promise.all(Array.from({ length: Math.min(5, claims.length) }, async () => {
      while (cursor < claims.length) {
        const claim = claims[cursor++];
        const args = { p_delivery_id: claim.delivery_id, p_claim_id: claim.claim_id };
        try {
          const prepared = await rpc<Prepared | null>('native_notification_prepare', args);
          if (!prepared) {
            result.canceled += 1;
            continue;
          }
          const outcome = await send(prepared, bearer, deps);
          const finished = await rpc<{ finalized: boolean }>('native_notification_finalize', {
            ...args,
            p_outcome: outcome,
          });
          if (finished.finalized === true) result[outcome] += 1;
          else result.stale += 1;
        } catch {
          result.errors += 1;
        }
      }
    }));
    return reply(result.errors ? 503 : 200, result);
  };
}
