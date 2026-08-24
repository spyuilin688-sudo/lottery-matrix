export type SupabaseAuthConfig = {
  url: string;
  anonKey: string;
};

export type LineLoginConfig = {
  channelId: string;
  channelSecret: string;
};

type SupabaseIdentity = {
  provider?: unknown;
  provider_id?: unknown;
};

type SupabaseUser = {
  identities?: unknown;
};

export type LineLogoutCode =
  | 'AUTH_REQUIRED'
  | 'LINE_PROVIDER_TOKEN_REQUIRED'
  | 'LINE_IDENTITY_REQUIRED'
  | 'LINE_LOGIN_NOT_CONFIGURED'
  | 'LINE_PROVIDER_REQUEST_FAILED';

export class LineLogoutError extends Error {
  code: LineLogoutCode;
  status: number;

  constructor(code: LineLogoutCode, status: number) {
    super(code);
    this.name = 'LineLogoutError';
    this.code = code;
    this.status = status;
  }
}

function fixedError(code: LineLogoutCode, status: number) {
  return new LineLogoutError(code, status);
}

function bearerToken(authorization: string | undefined) {
  const match = /^Bearer\s+(.+)$/i.exec(String(authorization ?? '').trim());
  if (!match?.[1]) throw fixedError('AUTH_REQUIRED', 401);
  return match[1];
}

function nonEmptyString(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value : '';
}

function lineProviderId(user: SupabaseUser) {
  const identities = Array.isArray(user.identities)
    ? user.identities as SupabaseIdentity[]
    : [];
  const identity = identities.find((item) => item?.provider === 'custom:line');
  return nonEmptyString(identity?.provider_id);
}

async function responseJson(response: Response) {
  try {
    return await response.json() as unknown;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function providerJson(response: Response) {
  const value = await responseJson(response);
  if (!isRecord(value)) throw fixedError('LINE_PROVIDER_REQUEST_FAILED', 502);
  return value;
}

function lineConfig(config: LineLoginConfig) {
  const channelId = nonEmptyString(config?.channelId);
  const channelSecret = nonEmptyString(config?.channelSecret);
  if (!channelId || !channelSecret) {
    throw fixedError('LINE_LOGIN_NOT_CONFIGURED', 503);
  }
  return { channelId, channelSecret };
}

export function createLineLogout(
  loadSupabaseConfig: () => Promise<SupabaseAuthConfig> | SupabaseAuthConfig,
  loadLineConfig: () => Promise<LineLoginConfig> | LineLoginConfig,
  fetcher: typeof fetch = fetch,
) {
  async function providerRequest(input: URL, init?: RequestInit) {
    try {
      const response = await fetcher(input, init);
      if (!response.ok) throw fixedError('LINE_PROVIDER_REQUEST_FAILED', 502);
      return response;
    } catch {
      throw fixedError('LINE_PROVIDER_REQUEST_FAILED', 502);
    }
  }

  async function providerResponseJson(response: Response) {
    try {
      return await providerJson(response);
    } catch {
      throw fixedError('LINE_PROVIDER_REQUEST_FAILED', 502);
    }
  }

  return {
    async logout(authorization: string | undefined, providerAccessToken: unknown): Promise<void> {
      const bearer = bearerToken(authorization);

      let authUser: SupabaseUser | null = null;
      try {
        const config = await loadSupabaseConfig();
        const authUrl = new URL('/auth/v1/user', config.url);
        const response = await fetcher(authUrl, {
          method: 'GET',
          headers: {
            apikey: config.anonKey,
            Authorization: `Bearer ${bearer}`,
          },
        });
        if (!response.ok) throw fixedError('AUTH_REQUIRED', 401);
        const value = await responseJson(response);
        if (!isRecord(value)) throw fixedError('AUTH_REQUIRED', 401);
        authUser = value;
      } catch {
        throw fixedError('AUTH_REQUIRED', 401);
      }

      const providerId = lineProviderId(authUser);
      if (!providerId) throw fixedError('LINE_IDENTITY_REQUIRED', 403);

      const accessToken = nonEmptyString(providerAccessToken);
      if (!accessToken) throw fixedError('LINE_PROVIDER_TOKEN_REQUIRED', 400);

      let config: { channelId: string; channelSecret: string };
      try {
        config = lineConfig(await loadLineConfig());
      } catch {
        throw fixedError('LINE_LOGIN_NOT_CONFIGURED', 503);
      }

      const verifyUrl = new URL('/oauth2/v2.1/verify', 'https://api.line.me');
      verifyUrl.searchParams.set('access_token', accessToken);
      const verifyResponse = await providerRequest(verifyUrl, { method: 'GET' });
      const verify = await providerResponseJson(verifyResponse);
      if (
        typeof verify.client_id !== 'string'
        || verify.client_id !== config.channelId
        || typeof verify.expires_in !== 'number'
        || !Number.isFinite(verify.expires_in)
        || verify.expires_in <= 0
      ) {
        throw fixedError('LINE_PROVIDER_REQUEST_FAILED', 502);
      }

      const userinfoUrl = new URL('/oauth2/v2.1/userinfo', 'https://api.line.me');
      const userinfoResponse = await providerRequest(userinfoUrl, {
        method: 'GET',
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const userinfo = await providerResponseJson(userinfoResponse);
      if (
        typeof userinfo.sub !== 'string'
        || !userinfo.sub.trim()
        || userinfo.sub !== providerId
      ) {
        throw fixedError('LINE_PROVIDER_REQUEST_FAILED', 502);
      }

      const revokeUrl = new URL('/oauth2/v2.1/revoke', 'https://api.line.me');
      const body = new URLSearchParams({
        access_token: accessToken,
        client_id: config.channelId,
        client_secret: config.channelSecret,
      });
      await providerRequest(revokeUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      });
    },
  };
}
