export type PushSubscription = {
  id: string;
  endpoint: string;
  p256dh: string;
  authKey: string;
};

export type PushPayload = {
  title: string;
  body: string;
  url: string;
};

export type DeliveryLog = {
  userId: string;
  subscriptionId: string;
  title: string;
  body: string;
  status: "sent" | "failed";
  failureReason: string | null;
  adminAccount: string;
  sentAt: string;
};

type Dependencies = {
  serviceRoleKey: string;
  listSubscriptions(userId: string): Promise<PushSubscription[]>;
  sendPush(
    subscription: PushSubscription,
    payload: PushPayload,
  ): Promise<void>;
  recordDelivery(log: DeliveryLog): Promise<void>;
  markSuccess(subscriptionId: string, at: string): Promise<void>;
  markFailure(
    subscriptionId: string,
    at: string,
    disable: boolean,
  ): Promise<void>;
  now?: () => Date;
};

export const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const PAYLOAD: PushPayload = {
  title: "樂彩 Matrix 測試通知",
  body: "手機推播已成功啟用",
  url: "/",
};

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...CORS_HEADERS,
      "Cache-Control": "no-store",
      "Content-Type": "application/json",
    },
  });
}

function nonEmpty(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function serviceRoleToken(request: Request) {
  const authorization = request.headers.get("Authorization") ?? "";
  const match = /^Bearer\s+(\S+)$/i.exec(authorization.trim());
  return match?.[1] ?? "";
}

function constantTimeEqual(left: string, right: string) {
  const leftBytes = new TextEncoder().encode(left);
  const rightBytes = new TextEncoder().encode(right);
  const length = Math.max(leftBytes.length, rightBytes.length);
  let difference = leftBytes.length ^ rightBytes.length;
  for (let index = 0; index < length; index += 1) {
    difference |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
  }
  return difference === 0;
}

function failureReason(cause: unknown) {
  if (cause instanceof Error && cause.message.trim()) return cause.message;
  return "Push delivery failed";
}

function expiredEndpoint(cause: unknown) {
  if (!cause || typeof cause !== "object") return false;
  const statusCode = Reflect.get(cause, "statusCode");
  return statusCode === 404 || statusCode === 410;
}

export function createSendTestPushHandler(dependencies: Dependencies) {
  const now = dependencies.now ?? (() => new Date());

  return async (request: Request): Promise<Response> => {
    if (request.method === "OPTIONS") {
      return new Response("ok", { headers: CORS_HEADERS });
    }
    if (request.method !== "POST") {
      return json({ error: { code: "METHOD_NOT_ALLOWED" } }, 405);
    }

    const token = serviceRoleToken(request);
    if (!token) return json({ error: { code: "AUTH_REQUIRED" } }, 401);
    if (
      !dependencies.serviceRoleKey ||
      !constantTimeEqual(token, dependencies.serviceRoleKey)
    ) {
      return json({ error: { code: "SERVICE_ROLE_REQUIRED" } }, 403);
    }

    let body: Record<string, unknown>;
    try {
      const value = await request.json();
      body = value && typeof value === "object" && !Array.isArray(value)
        ? value as Record<string, unknown>
        : {};
    } catch {
      body = {};
    }
    const userId = nonEmpty(body.userId);
    const adminAccount = nonEmpty(body.adminAccount);
    if (!userId || !adminAccount) {
      return json({ error: { code: "INVALID_REQUEST" } }, 400);
    }

    let subscriptions: PushSubscription[];
    try {
      subscriptions = await dependencies.listSubscriptions(userId);
    } catch {
      return json({ error: { code: "SUBSCRIPTION_LOOKUP_FAILED" } }, 500);
    }
    if (subscriptions.length === 0) {
      return json({ error: { code: "NO_ACTIVE_SUBSCRIPTIONS" } }, 409);
    }

    let sent = 0;
    let failed = 0;
    for (const subscription of subscriptions) {
      const sentAt = now().toISOString();
      let delivered = false;
      let sendFailure: unknown;
      try {
        await dependencies.sendPush(subscription, PAYLOAD);
        delivered = true;
      } catch (cause) {
        sendFailure = cause;
      }

      if (delivered) {
        await dependencies.markSuccess(subscription.id, sentAt);
        await dependencies.recordDelivery({
          userId,
          subscriptionId: subscription.id,
          title: PAYLOAD.title,
          body: PAYLOAD.body,
          status: "sent",
          failureReason: null,
          adminAccount,
          sentAt,
        });
        sent += 1;
      } else {
        const disable = expiredEndpoint(sendFailure);
        await dependencies.markFailure(subscription.id, sentAt, disable);
        await dependencies.recordDelivery({
          userId,
          subscriptionId: subscription.id,
          title: PAYLOAD.title,
          body: PAYLOAD.body,
          status: "failed",
          failureReason: failureReason(sendFailure),
          adminAccount,
          sentAt,
        });
        failed += 1;
      }
    }

    return json({ sent, failed }, 200);
  };
}
