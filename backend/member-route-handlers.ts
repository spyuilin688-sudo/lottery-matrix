type RequestEvent = { headers?: Record<string, string | undefined> };
type HandlerInput = { body?: unknown; event?: RequestEvent };
type RouteResult = { status: number; body: Record<string, unknown> };
type RouteHandler<Response> = (input: HandlerInput) => Promise<Response>;

type Dependencies<Response> = {
  bootstrapPost(input: { authorization?: string }): Promise<RouteResult>;
  profileGet(input: { authorization?: string }): Promise<RouteResult>;
  notificationGet(input: { authorization?: string; body: unknown }): Promise<RouteResult>;
  notificationSave(input: { authorization?: string; body: unknown }): Promise<RouteResult>;
  authorizationHeader(event?: RequestEvent): string | undefined;
  json(body: unknown, status?: number): Response;
};

export function createMemberRouteHandlers<Response = unknown>(dependencies: Dependencies<Response>): Record<string, [RouteHandler<Response>]> {
  return {
    'POST /api/member/bootstrap': [async ({ event }) => {
      const response = await dependencies.bootstrapPost({ authorization: dependencies.authorizationHeader(event) });
      return dependencies.json(response.body, response.status);
    }],
    'GET /api/member/profile': [async ({ event }) => {
      const response = await dependencies.profileGet({ authorization: dependencies.authorizationHeader(event) });
      return dependencies.json(response.body, response.status);
    }],
    'GET /api/member/notification-settings': [async ({ event }) => {
      const response = await dependencies.notificationGet({ authorization: dependencies.authorizationHeader(event), body: {} });
      return dependencies.json(response.body, response.status);
    }],
    'PUT /api/member/notification-settings': [async ({ body, event }) => {
      const response = await dependencies.notificationSave({ authorization: dependencies.authorizationHeader(event), body });
      return dependencies.json(response.body, response.status);
    }],
  };
}
