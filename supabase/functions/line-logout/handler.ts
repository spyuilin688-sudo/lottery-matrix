type SupabaseIdentity = { provider?: unknown; provider_id?: unknown };
type SupabaseUser = { identities?: unknown };

type Dependencies = {
  getUser(authorization: string): Promise<SupabaseUser | null>;
  getLineConfig(): { channelId: string; channelSecret: string };
  fetcher?: typeof fetch;
};

type ErrorCode =
  | 'AUTH_REQUIRED'
  | 'LINE_PROVIDER_TOKEN_REQUIRED'
  | 'LINE_IDENTITY_REQUIRED'
  | 'LINE_LOGIN_NOT_CONFIGURED'
  | 'LINE_PROVIDER_REQUEST_FAILED';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

class LineLogoutFailure extends Error {
  constructor(readonly code: ErrorCode, readonly status: number) {
    super(code);
  }
}

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function nonEmpty(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

function providerId(user: SupabaseUser) {
  const identities = Array.isArray(user.identities) ? user.identities as SupabaseIdentity[] : [];
  const identity = identities.find((item) => item?.provider === 'custom:line');
  return nonEmpty(identity?.provider_id);
}

async function responseObject(response: Response) {
  try {
    const value = await response.json();
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
  } catch {
    // Return only the fixed provider failure below.
  }
  throw new LineLogoutFailure('LINE_PROVIDER_REQUEST_FAILED', 502);
}

export function createLineLogoutHandler(dependencies: Dependencies) {
  const fetcher = dependencies.fetcher ?? fetch;

  async function providerRequest(input: URL, init?: RequestInit) {
    try {
      const response = await fetcher(input, { ...init, redirect: 'error' });
      if (!response.ok) throw new Error('provider request failed');
      return response;
    } catch {
      throw new LineLogoutFailure('LINE_PROVIDER_REQUEST_FAILED', 502);
    }
  }

  return async (request: Request): Promise<Response> => {
    if (request.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
    if (request.method !== 'POST') return json({ error: { code: 'METHOD_NOT_ALLOWED' } }, 405);

    try {
      const authorization = nonEmpty(request.headers.get('Authorization'));
      if (!/^Bearer\s+\S+$/i.test(authorization)) {
        throw new LineLogoutFailure('AUTH_REQUIRED', 401);
      }

      const user = await dependencies.getUser(authorization);
      if (!user) throw new LineLogoutFailure('AUTH_REQUIRED', 401);
      const lineUserId = providerId(user);
      if (!lineUserId) throw new LineLogoutFailure('LINE_IDENTITY_REQUIRED', 403);

      let body: Record<string, unknown> = {};
      try {
        const value = await request.json();
        if (value && typeof value === 'object' && !Array.isArray(value)) body = value;
      } catch {
        body = {};
      }
      const providerAccessToken = nonEmpty(body.providerAccessToken);
      if (!providerAccessToken) {
        throw new LineLogoutFailure('LINE_PROVIDER_TOKEN_REQUIRED', 400);
      }

      const rawConfig = dependencies.getLineConfig();
      const channelId = nonEmpty(rawConfig.channelId);
      const channelSecret = nonEmpty(rawConfig.channelSecret);
      if (!channelId || !channelSecret) {
        throw new LineLogoutFailure('LINE_LOGIN_NOT_CONFIGURED', 503);
      }

      const verifyUrl = new URL('/oauth2/v2.1/verify', 'https://api.line.me');
      verifyUrl.searchParams.set('access_token', providerAccessToken);
      const verify = await responseObject(await providerRequest(verifyUrl));
      if (
        verify.client_id !== channelId
        || typeof verify.expires_in !== 'number'
        || !Number.isFinite(verify.expires_in)
        || verify.expires_in <= 0
      ) {
        throw new LineLogoutFailure('LINE_PROVIDER_REQUEST_FAILED', 502);
      }

      const userInfoUrl = new URL('/oauth2/v2.1/userinfo', 'https://api.line.me');
      const lineUser = await responseObject(await providerRequest(userInfoUrl, {
        headers: { Authorization: `Bearer ${providerAccessToken}` },
      }));
      if (lineUser.sub !== lineUserId) {
        throw new LineLogoutFailure('LINE_PROVIDER_REQUEST_FAILED', 502);
      }

      const revokeUrl = new URL('/oauth2/v2.1/revoke', 'https://api.line.me');
      await providerRequest(revokeUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          access_token: providerAccessToken,
          client_id: channelId,
          client_secret: channelSecret,
        }),
      });

      return json({ ok: true }, 200);
    } catch (cause) {
      const failure = cause instanceof LineLogoutFailure
        ? cause
        : new LineLogoutFailure('LINE_PROVIDER_REQUEST_FAILED', 502);
      return json({ error: { code: failure.code } }, failure.status);
    }
  };
}
