import { LineLogoutError } from './line-logout';

type RouteResult = { status: number; body: { ok: true } | { error: { code: string } } };

type Dependencies = {
  logout(authorization: string | undefined, providerAccessToken: unknown): Promise<void>;
};

function failure(cause: unknown): RouteResult {
  if (cause instanceof LineLogoutError) {
    return { status: cause.status, body: { error: { code: cause.code } } };
  }
  return { status: 502, body: { error: { code: 'LINE_PROVIDER_REQUEST_FAILED' } } };
}

export function createLineLogoutRoutes(dependencies: Dependencies) {
  return {
    async post(input: { authorization?: string; body: unknown }): Promise<RouteResult> {
      try {
        await dependencies.logout(
          input.authorization,
          (input.body as { providerAccessToken?: unknown } | null)?.providerAccessToken,
        );
        return { status: 200, body: { ok: true } };
      } catch (cause) {
        return failure(cause);
      }
    },
  };
}
