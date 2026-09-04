import {
  LINE_LOGOUT_STAGE_TIMEOUT_MS,
  withRequestDeadline,
} from '../_shared/request-deadline.ts';

type SupabaseIdentity = { provider?: unknown; provider_id?: unknown };
type SupabaseUser = { identities?: unknown };

type PublicCode =
  | 'AUTH_REQUIRED'
  | 'LINE_PROVIDER_TOKEN_REQUIRED'
  | 'LINE_IDENTITY_REQUIRED'
  | 'LINE_LOGIN_NOT_CONFIGURED'
  | 'LINE_PROVIDER_REQUEST_FAILED'
  | 'METHOD_NOT_ALLOWED'
  | 'ORIGIN_NOT_ALLOWED';

type LogCode = PublicCode | 'OK';
type LogStage = 'request' | 'auth' | 'verify' | 'userinfo' | 'revoke';

export type LineLogoutLogRecord = {
  version: 1;
  requestId: string;
  stage: LogStage;
  outcome: 'success' | 'error';
  durationMs: number;
  code: LogCode;
};

type Dependencies = {
  getUser(authorization: string, signal: AbortSignal): Promise<SupabaseUser | null>;
  getLineConfig(): { channelId: string; channelSecret: string };
  fetcher?: typeof fetch;
  logger?: (record: LineLogoutLogRecord) => void;
};

const ALLOWED_ORIGINS = new Set([
  'https://matrix-un0kjz.v2.appdeploy.ai',
  'https://matrixlottery.idv.tw',
]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

class LineLogoutFailure extends Error {
  logged = false;

  constructor(readonly code: PublicCode, readonly status: number) {
    super(code);
    this.name = 'LineLogoutFailure';
  }
}

function requestIdFor(request: Request) {
  const callerId = request.headers.get('X-Request-ID');
  return callerId && UUID_PATTERN.test(callerId) ? callerId : crypto.randomUUID();
}

function responseHeaders(origin: string | null, requestId: string) {
  const headers = new Headers({
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-request-id',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Cache-Control': 'no-store',
    'Vary': 'Origin',
    'X-Request-ID': requestId,
  });
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    headers.set('Access-Control-Allow-Origin', origin);
  }
  return headers;
}

function json(body: unknown, status: number, origin: string | null, requestId: string) {
  const headers = responseHeaders(origin, requestId);
  headers.set('Content-Type', 'application/json');
  return new Response(JSON.stringify(body), { status, headers });
}

function errorResponse(failure: LineLogoutFailure, origin: string | null, requestId: string) {
  return json({ error: { code: failure.code }, requestId }, failure.status, origin, requestId);
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
    // The caller maps every parse failure to a fixed public code.
  }
  throw new LineLogoutFailure('LINE_PROVIDER_REQUEST_FAILED', 502);
}

async function requestObject(request: Request, signal: AbortSignal) {
  const stream = request.body;
  if (!stream) return {};
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  const cancel = () => {
    void reader.cancel(signal.reason).catch(() => undefined);
  };
  signal.addEventListener('abort', cancel, { once: true });
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      byteLength += value.byteLength;
    }
    if (signal.aborted) throw signal.reason;
  } finally {
    signal.removeEventListener('abort', cancel);
    reader.releaseLock();
  }

  const body = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    const value = JSON.parse(new TextDecoder().decode(body));
    return value && typeof value === 'object' && !Array.isArray(value)
      ? value as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

export function createLineLogoutHandler(dependencies: Dependencies) {
  const fetcher = dependencies.fetcher ?? fetch;
  const logger = dependencies.logger ?? ((record: LineLogoutLogRecord) => console.info(record));

  function writeLog(record: LineLogoutLogRecord) {
    try {
      logger(record);
    } catch {
      // Observability must not change the revoke result.
    }
  }

  async function runStage<T>(
    stage: LogStage,
    requestId: string,
    requestSignal: AbortSignal,
    failure: LineLogoutFailure,
    operation: (signal: AbortSignal) => Promise<T>,
  ) {
    const startedAt = Date.now();
    try {
      const result = await withRequestDeadline(operation, {
        signal: requestSignal,
        timeoutMs: LINE_LOGOUT_STAGE_TIMEOUT_MS,
      });
      writeLog({
        version: 1,
        requestId,
        stage,
        outcome: 'success',
        durationMs: Math.max(0, Date.now() - startedAt),
        code: 'OK',
      });
      return result;
    } catch {
      failure.logged = true;
      writeLog({
        version: 1,
        requestId,
        stage,
        outcome: 'error',
        durationMs: Math.max(0, Date.now() - startedAt),
        code: failure.code,
      });
      throw failure;
    }
  }

  async function providerResponse(
    stage: Extract<LogStage, 'verify' | 'userinfo'>,
    requestId: string,
    requestSignal: AbortSignal,
    input: URL,
    init: RequestInit,
    validate: (value: Record<string, unknown>) => boolean,
  ) {
    return runStage(
      stage,
      requestId,
      requestSignal,
      new LineLogoutFailure('LINE_PROVIDER_REQUEST_FAILED', 502),
      async (signal) => {
        const response = await fetcher(input, { ...init, redirect: 'error', signal });
        if (!response.ok) throw new LineLogoutFailure('LINE_PROVIDER_REQUEST_FAILED', 502);
        const value = await responseObject(response);
        if (!validate(value)) throw new LineLogoutFailure('LINE_PROVIDER_REQUEST_FAILED', 502);
        return value;
      },
    );
  }

  return async (request: Request): Promise<Response> => {
    const startedAt = Date.now();
    const requestId = requestIdFor(request);
    const origin = request.headers.get('Origin');

    if (origin && !ALLOWED_ORIGINS.has(origin)) {
      const failure = new LineLogoutFailure('ORIGIN_NOT_ALLOWED', 403);
      writeLog({
        version: 1,
        requestId,
        stage: 'request',
        outcome: 'error',
        durationMs: Math.max(0, Date.now() - startedAt),
        code: failure.code,
      });
      return errorResponse(failure, null, requestId);
    }

    if (request.method === 'OPTIONS') {
      writeLog({
        version: 1,
        requestId,
        stage: 'request',
        outcome: 'success',
        durationMs: Math.max(0, Date.now() - startedAt),
        code: 'OK',
      });
      return new Response('ok', { status: 200, headers: responseHeaders(origin, requestId) });
    }
    if (request.method !== 'POST') {
      const failure = new LineLogoutFailure('METHOD_NOT_ALLOWED', 405);
      writeLog({
        version: 1,
        requestId,
        stage: 'request',
        outcome: 'error',
        durationMs: Math.max(0, Date.now() - startedAt),
        code: failure.code,
      });
      return errorResponse(failure, origin, requestId);
    }

    try {
      const authorization = nonEmpty(request.headers.get('Authorization'));
      if (!/^Bearer\s+\S+$/i.test(authorization)) {
        throw new LineLogoutFailure('AUTH_REQUIRED', 401);
      }

      const user = await runStage(
        'auth',
        requestId,
        request.signal,
        new LineLogoutFailure('AUTH_REQUIRED', 401),
        async (signal) => {
          const result = await dependencies.getUser(authorization, signal);
          if (!result) throw new LineLogoutFailure('AUTH_REQUIRED', 401);
          return result;
        },
      );
      const lineUserId = providerId(user);
      if (!lineUserId) throw new LineLogoutFailure('LINE_IDENTITY_REQUIRED', 403);

      const providerAccessToken = await runStage(
        'request',
        requestId,
        request.signal,
        new LineLogoutFailure('LINE_PROVIDER_TOKEN_REQUIRED', 400),
        async (signal) => {
          const body = await requestObject(request, signal);
          const token = nonEmpty(body.providerAccessToken);
          if (!token) throw new LineLogoutFailure('LINE_PROVIDER_TOKEN_REQUIRED', 400);
          return token;
        },
      );

      const rawConfig = dependencies.getLineConfig();
      const channelId = nonEmpty(rawConfig.channelId);
      const channelSecret = nonEmpty(rawConfig.channelSecret);
      if (!channelId || !channelSecret) {
        throw new LineLogoutFailure('LINE_LOGIN_NOT_CONFIGURED', 503);
      }

      const verifyUrl = new URL('/oauth2/v2.1/verify', 'https://api.line.me');
      verifyUrl.searchParams.set('access_token', providerAccessToken);
      await providerResponse('verify', requestId, request.signal, verifyUrl, {}, (verify) => (
        verify.client_id === channelId
        && typeof verify.expires_in === 'number'
        && Number.isFinite(verify.expires_in)
        && verify.expires_in > 0
      ));

      const userInfoUrl = new URL('/oauth2/v2.1/userinfo', 'https://api.line.me');
      await providerResponse(
        'userinfo',
        requestId,
        request.signal,
        userInfoUrl,
        { headers: { Authorization: `Bearer ${providerAccessToken}` } },
        (lineUser) => lineUser.sub === lineUserId,
      );

      const revokeUrl = new URL('/oauth2/v2.1/revoke', 'https://api.line.me');
      await runStage(
        'revoke',
        requestId,
        request.signal,
        new LineLogoutFailure('LINE_PROVIDER_REQUEST_FAILED', 502),
        async (signal) => {
          const response = await fetcher(revokeUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
              access_token: providerAccessToken,
              client_id: channelId,
              client_secret: channelSecret,
            }),
            redirect: 'error',
            signal,
          });
          if (!response.ok) throw new LineLogoutFailure('LINE_PROVIDER_REQUEST_FAILED', 502);
        },
      );

      return json({ ok: true }, 200, origin, requestId);
    } catch (cause) {
      const failure = cause instanceof LineLogoutFailure
        ? cause
        : new LineLogoutFailure('LINE_PROVIDER_REQUEST_FAILED', 502);
      if (!failure.logged) {
        writeLog({
          version: 1,
          requestId,
          stage: 'request',
          outcome: 'error',
          durationMs: Math.max(0, Date.now() - startedAt),
          code: failure.code,
        });
      }
      return errorResponse(failure, origin, requestId);
    }
  };
}
