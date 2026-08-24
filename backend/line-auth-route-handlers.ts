type RequestEvent = { headers?: Record<string, string | undefined> };
type HandlerInput = { body?: unknown; event?: RequestEvent };
type RouteResult = { status: number; body: Record<string, unknown> };
type RouteHandler<Response> = (input: HandlerInput) => Promise<Response>;

type Dependencies<Response> = {
  logoutPost(input: { authorization?: string; body: unknown }): Promise<RouteResult>;
  authorizationHeader(event?: RequestEvent): string | undefined;
  json(body: unknown, status?: number): Response;
};

export function createLineAuthRouteHandlers<Response = unknown>(dependencies: Dependencies<Response>): Record<string, [RouteHandler<Response>]> {
  return {
    'POST /api/auth/line/logout': [async ({ body, event }) => {
      const response = await dependencies.logoutPost({
        authorization: dependencies.authorizationHeader(event),
        body,
      });
      return dependencies.json(response.body, response.status);
    }],
  };
}
