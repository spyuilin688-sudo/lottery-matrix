import { afterEach, vi } from 'vitest';
import {
  createNotificationDispatchHandler,
  type ClaimedNotificationWork,
} from "./handler.ts";
import type {
  DeliveryLog,
  PushPayload,
  PushSubscription,
} from "../_shared/web-push-delivery.ts";

function assertEquals(actual: unknown, expected: unknown) {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(`Expected ${expectedJson}, received ${actualJson}`);
  }
}

const TOKEN = "dispatch-token";
const NOW = "2026-09-03T10:00:00.000Z";

const WORK: ClaimedNotificationWork = {
  outboxId: "outbox-1",
  memberId: "member-1",
  userId: "user-1",
  eventId: "event-1",
  eventKey: "lottery_result:539:115210",
  payload: {
    title: "今彩539 開獎結果",
    body: "第115210期｜01 02 03 04 05",
    url: "/",
    tag: "tag-1",
  },
  attemptCount: 1,
};

const SUB_A: PushSubscription = {
  id: "sub-a",
  endpoint: "https://fcm.googleapis.com/fcm/send/a",
  p256dh: "p-a",
  authKey: "a-a",
};
const SUB_B: PushSubscription = {
  id: "sub-b",
  endpoint: "https://fcm.googleapis.com/fcm/send/b",
  p256dh: "p-b",
  authKey: "a-b",
};

function request(
  token: string | null = TOKEN,
  body: unknown = {},
  method = "POST",
) {
  const headers = new Headers({ "Content-Type": "application/json" });
  if (token !== null) headers.set("x-matrix-dispatch-token", token);
  return new Request("https://project.supabase.co/functions/v1/notification-dispatch", {
    method,
    headers,
    body: method === "POST" ? JSON.stringify(body) : undefined,
  });
}

function setup(options: {
  work?: ClaimedNotificationWork[];
  subscriptions?: PushSubscription[];
  sendPush?: (subscription: PushSubscription, payload: PushPayload) => Promise<void>;
  recordDelivery?: (log: DeliveryLog) => Promise<void>;
  markSent?: (outboxId: string) => Promise<boolean>;
} = {}) {
  const claimed = options.work ?? [WORK];
  const subscriptions = options.subscriptions ?? [SUB_A];
  const observations = {
    claimLimits: [] as number[],
    subscriptionUsers: [] as string[],
    sent: [] as Array<{ outboxId: string; at: string }>,
    skipped: [] as Array<{ outboxId: string; reason: string; at: string }>,
    retried: [] as Array<{ outboxId: string; error: string; nextAt: string }>,
    failed: [] as Array<{ outboxId: string; error: string; at: string }>,
    deliveryLogs: [] as DeliveryLog[],
    subscriptionFailures: [] as Array<{ subscriptionId: string; disable: boolean }>,
    pushTargets: [] as string[],
  };

  return {
    observations,
    handler: createNotificationDispatchHandler({
      dispatchToken: TOKEN,
      now: () => new Date(NOW),
      async claim(limit) {
        observations.claimLimits.push(limit);
        return claimed;
      },
      async listSubscriptions(userId) {
        observations.subscriptionUsers.push(userId);
        return subscriptions;
      },
      async sendPush(subscription, payload) {
        observations.pushTargets.push(subscription.id);
        if (options.sendPush) return options.sendPush(subscription, payload);
      },
      async recordDelivery(log) {
        observations.deliveryLogs.push(log);
        if (options.recordDelivery) return options.recordDelivery(log);
      },
      async markSuccess() {},
      async markFailure(subscriptionId, _at, disable) {
        observations.subscriptionFailures.push({ subscriptionId, disable });
      },
      async markSent(outboxId, at) {
        observations.sent.push({ outboxId, at });
        if (options.markSent) return options.markSent(outboxId);
        return true;
      },
      async markSkipped(outboxId, reason, at) {
        observations.skipped.push({ outboxId, reason, at });
        return true;
      },
      async markRetry(outboxId, error, nextAt) {
        observations.retried.push({ outboxId, error, nextAt });
        return true;
      },
      async markFailed(outboxId, error, at) {
        observations.failed.push({ outboxId, error, at });
        return true;
      },
    }),
  };
}

Deno.test("notification dispatcher accepts OPTIONS without claiming work", async () => {
  const test = setup();
  const response = await test.handler(request(null, {}, "OPTIONS"));
  assertEquals(response.status, 200);
  assertEquals(test.observations.claimLimits, []);
});

Deno.test("notification dispatcher rejects missing and wrong dispatch token", async () => {
  const test = setup();
  const missing = await test.handler(request(null));
  const wrong = await test.handler(request("wrong-token"));
  assertEquals([missing.status, wrong.status], [401, 403]);
  assertEquals(test.observations.claimLimits, []);
});

Deno.test("notification dispatcher ignores arbitrary recipient and message fields from request body", async () => {
  const test = setup();
  const response = await test.handler(request(TOKEN, {
    userId: "attacker-selected-user",
    title: "attacker title",
    body: "attacker body",
    recipient: "attacker recipient",
  }));
  assertEquals(response.status, 200);
  assertEquals(test.observations.claimLimits, [25]);
  assertEquals(test.observations.subscriptionUsers, ["user-1"]);
  assertEquals(test.observations.pushTargets, ["sub-a"]);
  assertEquals(test.observations.deliveryLogs[0]?.title, WORK.payload.title);
  assertEquals(test.observations.sent, [{ outboxId: "outbox-1", at: NOW }]);
  assertEquals(await response.json(), {
    claimed: 1,
    sent: 1,
    skipped: 0,
    retried: 0,
    failed: 0,
  });
});

Deno.test("notification dispatcher skips outbox work with no enabled subscriptions", async () => {
  const test = setup({ subscriptions: [] });
  const response = await test.handler(request());
  assertEquals(response.status, 200);
  assertEquals(test.observations.skipped, [{
    outboxId: "outbox-1",
    reason: "no_enabled_subscription",
    at: NOW,
  }]);
  assertEquals(await response.json(), {
    claimed: 1,
    sent: 0,
    skipped: 1,
    retried: 0,
    failed: 0,
  });
});

Deno.test("notification dispatcher marks sent when any endpoint succeeds", async () => {
  const permanent = Object.assign(new Error("expired"), { statusCode: 410 });
  const test = setup({
    subscriptions: [SUB_A, SUB_B],
    sendPush(subscription) {
      return subscription.id === "sub-a" ? Promise.reject(permanent) : Promise.resolve();
    },
  });
  const response = await test.handler(request());
  assertEquals(response.status, 200);
  assertEquals(test.observations.sent, [{ outboxId: "outbox-1", at: NOW }]);
  assertEquals(test.observations.skipped, []);
  assertEquals(test.observations.subscriptionFailures, [{
    subscriptionId: "sub-a",
    disable: true,
  }]);
});

Deno.test("notification dispatcher skips when every endpoint failure is permanent", async () => {
  const test = setup({
    subscriptions: [SUB_A, SUB_B],
    sendPush(subscription) {
      return Promise.reject(Object.assign(new Error(`expired-${subscription.id}`), {
        statusCode: subscription.id === "sub-a" ? 404 : 410,
      }));
    },
  });
  const response = await test.handler(request());
  assertEquals(response.status, 200);
  assertEquals(test.observations.skipped, [{
    outboxId: "outbox-1",
    reason: "no_valid_subscription",
    at: NOW,
  }]);
  assertEquals(test.observations.retried, []);
});

Deno.test("notification dispatcher retries transient-only failure with deterministic schedule", async () => {
  const test = setup({
    sendPush: () => Promise.reject(new Error("temporary provider failure")),
  });
  const response = await test.handler(request());
  assertEquals(response.status, 200);
  assertEquals(test.observations.retried, [{
    outboxId: "outbox-1",
    error: "temporary provider failure",
    nextAt: "2026-09-03T10:01:00.000Z",
  }]);
  assertEquals(test.observations.failed, []);
  assertEquals(await response.json(), {
    claimed: 1,
    sent: 0,
    skipped: 0,
    retried: 1,
    failed: 0,
  });
});

Deno.test("notification dispatcher makes fifth transient failure terminal", async () => {
  const test = setup({
    work: [{ ...WORK, attemptCount: 5 }],
    sendPush: () => Promise.reject(new Error("provider still unavailable")),
  });
  const response = await test.handler(request());
  assertEquals(response.status, 200);
  assertEquals(test.observations.failed, [{
    outboxId: "outbox-1",
    error: "provider still unavailable",
    at: NOW,
  }]);
  assertEquals(test.observations.retried, []);
  assertEquals(await response.json(), {
    claimed: 1,
    sent: 0,
    skipped: 0,
    retried: 0,
    failed: 1,
  });
});

Deno.test("delivery log failure finalizes the confirmed send without retrying it", async () => {
  const test = setup({
    recordDelivery: () => Promise.reject(new Error("delivery log unavailable")),
  });
  const response = await test.handler(request());
  assertEquals(response.status, 200);
  assertEquals(test.observations.sent, [{ outboxId: WORK.outboxId, at: NOW }]);
  assertEquals(test.observations.skipped, []);
  assertEquals(test.observations.retried, []);
  assertEquals(test.observations.failed, []);
});

afterEach(() => vi.useRealTimers());

Deno.test('failed finalization does not abort the rest of a claimed batch or resend in the same invocation', async () => {
  const fixture = setup({
    work: Array.from({ length: 6 }, (_, index) => ({ ...WORK, outboxId: `outbox-${index}` })),
    markSent: (id) => id === 'outbox-0' ? Promise.reject(new Error('storage unavailable')) : Promise.resolve(true),
  });
  const response = await fixture.handler(request());
  assertEquals(response.status, 500);
  assertEquals(await response.json(), { error: { code: 'DISPATCH_FAILED' } });
  assertEquals(fixture.observations.sent.length, 6);
  assertEquals(fixture.observations.pushTargets.length, 6);
  assertEquals(fixture.observations.retried, []);
});

Deno.test('dispatch limits concurrent push operations to four while draining the batch', async () => {
  vi.useFakeTimers();
  let active = 0;
  let maximumActive = 0;
  const fixture = setup({
    work: Array.from({ length: 9 }, (_, index) => ({ ...WORK, outboxId: `outbox-${index}` })),
    sendPush: () => new Promise((resolve) => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      setTimeout(() => { active -= 1; resolve(); }, 100);
    }),
  });
  const pending = fixture.handler(request());
  await vi.advanceTimersByTimeAsync(300);
  assertEquals((await pending).status, 200);
  assertEquals(maximumActive, 4);
  assertEquals(fixture.observations.sent.length, 9);
});

Deno.test('a stalled delivery does not hold healthy notifications in the same claim', async () => {
  vi.useFakeTimers();
  const fixture = setup({
    work: [WORK, { ...WORK, outboxId: 'outbox-2', payload: { ...WORK.payload, title: 'healthy' } }],
    sendPush: (_subscription, payload) => payload.title === 'healthy' ? Promise.resolve() : new Promise(() => {}),
  });
  const pending = fixture.handler(request());
  await vi.advanceTimersByTimeAsync(0);
  assertEquals(fixture.observations.sent.map((item) => item.outboxId), ['outbox-2']);
  await vi.advanceTimersByTimeAsync(8_000);
  const response = await pending;
  assertEquals(response.status, 200);
  assertEquals(fixture.observations.retried.map((item) => item.outboxId), ['outbox-1']);
});
