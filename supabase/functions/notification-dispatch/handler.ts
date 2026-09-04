import {
  deliverPushToSubscription,
  type DeliveryDependencies,
  type PushPayload,
  type PushSubscription,
} from "../_shared/web-push-delivery.ts";

export type ClaimedNotificationWork = {
  outboxId: string;
  memberId: string;
  userId: string;
  eventId: string;
  eventKey: string;
  payload: PushPayload;
  attemptCount: number;
};

type Dependencies = DeliveryDependencies & {
  dispatchToken: string;
  claim(limit: number): Promise<ClaimedNotificationWork[]>;
  listSubscriptions(userId: string): Promise<PushSubscription[]>;
  markSent(outboxId: string, processedAt: string): Promise<boolean>;
  markSkipped(
    outboxId: string,
    reason: string,
    processedAt: string,
  ): Promise<boolean>;
  markRetry(
    outboxId: string,
    error: string,
    nextAttemptAt: string,
  ): Promise<boolean>;
  markFailed(
    outboxId: string,
    error: string,
    processedAt: string,
  ): Promise<boolean>;
};

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, x-matrix-dispatch-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const CLAIM_LIMIT = 25;
const RETRY_MINUTES = [1, 2, 5, 15, 30] as const;
const DISPATCH_ACCOUNT = "system:notification-dispatch";

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

function nextRetryAt(now: Date, attemptCount: number) {
  const index = Math.min(
    Math.max(attemptCount - 1, 0),
    RETRY_MINUTES.length - 1,
  );
  return new Date(now.getTime() + RETRY_MINUTES[index] * 60_000).toISOString();
}

function retryReason(
  results: Array<{ permanentFailure: boolean; failureReason: string | null }>,
) {
  return results.find((result) => !result.permanentFailure)?.failureReason ??
    results.find((result) => result.failureReason)?.failureReason ??
    "Push delivery failed";
}

function requireFinalized(result: boolean) {
  if (!result) throw new Error("OUTBOX_FINALIZE_FAILED");
}

export function createNotificationDispatchHandler(dependencies: Dependencies) {
  const now = dependencies.now ?? (() => new Date());

  return async (request: Request): Promise<Response> => {
    if (request.method === "OPTIONS") {
      return new Response("ok", { headers: CORS_HEADERS });
    }
    if (request.method !== "POST") {
      return json({ error: { code: "METHOD_NOT_ALLOWED" } }, 405);
    }

    const suppliedToken = request.headers.get("x-matrix-dispatch-token")?.trim() ?? "";
    if (!suppliedToken) return json({ error: { code: "AUTH_REQUIRED" } }, 401);
    if (!dependencies.dispatchToken || !constantTimeEqual(suppliedToken, dependencies.dispatchToken)) {
      return json({ error: { code: "INVALID_TOKEN" } }, 403);
    }

    try {
      const workItems = await dependencies.claim(CLAIM_LIMIT);
      const totals = {
        claimed: workItems.length,
        sent: 0,
        skipped: 0,
        retried: 0,
        failed: 0,
      };

      for (const work of workItems) {
        const subscriptions = await dependencies.listSubscriptions(work.userId);
        const processedAt = now();
        const processedAtIso = processedAt.toISOString();

        if (subscriptions.length === 0) {
          requireFinalized(await dependencies.markSkipped(
            work.outboxId,
            "no_enabled_subscription",
            processedAtIso,
          ));
          totals.skipped += 1;
          continue;
        }

        const deliveryResults = [];
        for (const subscription of subscriptions) {
          deliveryResults.push(await deliverPushToSubscription(dependencies, {
            userId: work.userId,
            subscription,
            payload: work.payload,
            adminAccount: DISPATCH_ACCOUNT,
          }));
        }

        if (deliveryResults.some((result) => result.delivered)) {
          requireFinalized(await dependencies.markSent(work.outboxId, processedAtIso));
          totals.sent += 1;
          continue;
        }

        if (deliveryResults.every((result) => result.permanentFailure)) {
          requireFinalized(await dependencies.markSkipped(
            work.outboxId,
            "no_valid_subscription",
            processedAtIso,
          ));
          totals.skipped += 1;
          continue;
        }

        const error = retryReason(deliveryResults);
        if (work.attemptCount >= 5) {
          requireFinalized(await dependencies.markFailed(
            work.outboxId,
            error,
            processedAtIso,
          ));
          totals.failed += 1;
          continue;
        }

        requireFinalized(await dependencies.markRetry(
          work.outboxId,
          error,
          nextRetryAt(processedAt, work.attemptCount),
        ));
        totals.retried += 1;
      }

      return json(totals, 200);
    } catch {
      return json({ error: { code: "DISPATCH_FAILED" } }, 500);
    }
  };
}
