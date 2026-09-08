import {
  deliverPushToSubscription,
  type DeliveryLog,
  type PushPayload,
  type PushSubscription,
} from "./web-push-delivery.ts";

function assertEquals(actual: unknown, expected: unknown) {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(`Expected ${expectedJson}, received ${actualJson}`);
  }
}

async function assertRejects(
  operation: () => Promise<unknown>,
  expectedMessage: string,
) {
  let thrown: unknown;
  try {
    await operation();
  } catch (error) {
    thrown = error;
  }
  if (!(thrown instanceof Error) || thrown.message !== expectedMessage) {
    throw new Error(
      `Expected rejection ${JSON.stringify(expectedMessage)}, received ${String(thrown)}`,
    );
  }
}

const SUBSCRIPTION: PushSubscription = {
  id: "subscription-a",
  endpoint: "https://fcm.googleapis.com/fcm/send/a",
  p256dh: "p256dh-a",
  authKey: "auth-a",
};

const PAYLOAD: PushPayload = {
  title: "今彩539 開獎結果",
  body: "第115207期｜01 02 03 04 05",
  url: "/",
  tag: "stable-event-tag",
};

function setup(overrides: {
  sendPush?: (
    subscription: PushSubscription,
    payload: PushPayload,
  ) => Promise<void>;
  recordDelivery?: (log: DeliveryLog) => Promise<void>;
} = {}) {
  const sent: Array<{ subscription: PushSubscription; payload: PushPayload }> = [];
  const logs: DeliveryLog[] = [];
  const successes: Array<{ subscriptionId: string; at: string }> = [];
  const failures: Array<{ subscriptionId: string; at: string; disable: boolean }> = [];

  return {
    observations: { sent, logs, successes, failures },
    dependencies: {
      now: () => new Date("2026-09-03T08:50:00.000Z"),
      sendPush(subscription: PushSubscription, payload: PushPayload) {
        sent.push({ subscription, payload });
        return overrides.sendPush?.(subscription, payload) ?? Promise.resolve();
      },
      recordDelivery(log: DeliveryLog) {
        logs.push(log);
        return overrides.recordDelivery?.(log) ?? Promise.resolve();
      },
      markSuccess(subscriptionId: string, at: string) {
        successes.push({ subscriptionId, at });
        return Promise.resolve();
      },
      markFailure(subscriptionId: string, at: string, disable: boolean) {
        failures.push({ subscriptionId, at, disable });
        return Promise.resolve();
      },
    },
  };
}

Deno.test("shared delivery marks success and records sent delivery", async () => {
  const test = setup();

  const result = await deliverPushToSubscription(test.dependencies, {
    userId: "user-1",
    subscription: SUBSCRIPTION,
    payload: PAYLOAD,
    adminAccount: "system:notification-dispatch",
  });

  assertEquals(result, {
    delivered: true,
    permanentFailure: false,
    failureReason: null,
    sentAt: "2026-09-03T08:50:00.000Z",
  });
  assertEquals(test.observations.sent, [
    { subscription: SUBSCRIPTION, payload: PAYLOAD },
  ]);
  assertEquals(test.observations.successes, [
    { subscriptionId: "subscription-a", at: "2026-09-03T08:50:00.000Z" },
  ]);
  assertEquals(test.observations.failures, []);
  assertEquals(test.observations.logs, [
    {
      userId: "user-1",
      subscriptionId: "subscription-a",
      title: PAYLOAD.title,
      body: PAYLOAD.body,
      status: "sent",
      failureReason: null,
      adminAccount: "system:notification-dispatch",
      sentAt: "2026-09-03T08:50:00.000Z",
    },
  ]);
});

for (const statusCode of [404, 410]) {
  Deno.test(`shared delivery treats HTTP ${statusCode} as permanent endpoint failure`, async () => {
    const providerError = Object.assign(new Error("expired endpoint"), { statusCode });
    const test = setup({
      sendPush: () => Promise.reject(providerError),
    });

    const result = await deliverPushToSubscription(test.dependencies, {
      userId: "user-1",
      subscription: SUBSCRIPTION,
      payload: PAYLOAD,
      adminAccount: "admin@test",
    });

    assertEquals(result, {
      delivered: false,
      permanentFailure: true,
      failureReason: "expired endpoint",
      sentAt: "2026-09-03T08:50:00.000Z",
    });
    assertEquals(test.observations.successes, []);
    assertEquals(test.observations.failures, [
      {
        subscriptionId: "subscription-a",
        at: "2026-09-03T08:50:00.000Z",
        disable: true,
      },
    ]);
    assertEquals(test.observations.logs[0], {
      userId: "user-1",
      subscriptionId: "subscription-a",
      title: PAYLOAD.title,
      body: PAYLOAD.body,
      status: "failed",
      failureReason: "expired endpoint",
      adminAccount: "admin@test",
      sentAt: "2026-09-03T08:50:00.000Z",
    });
  });
}

Deno.test("shared delivery keeps transient provider failure retryable", async () => {
  const test = setup({
    sendPush: () => Promise.reject(new Error("temporary provider failure")),
  });

  const result = await deliverPushToSubscription(test.dependencies, {
    userId: "user-1",
    subscription: SUBSCRIPTION,
    payload: PAYLOAD,
    adminAccount: "system:notification-dispatch",
  });

  assertEquals(result, {
    delivered: false,
    permanentFailure: false,
    failureReason: "temporary provider failure",
    sentAt: "2026-09-03T08:50:00.000Z",
  });
  assertEquals(test.observations.failures, [
    {
      subscriptionId: "subscription-a",
      at: "2026-09-03T08:50:00.000Z",
      disable: false,
    },
  ]);
});

Deno.test("delivery log failure rejects after successful push without reclassifying provider result", async () => {
  const test = setup({
    recordDelivery: () => Promise.reject(new Error("delivery log unavailable")),
  });

  await assertRejects(
    () => deliverPushToSubscription(test.dependencies, {
      userId: "user-1",
      subscription: SUBSCRIPTION,
      payload: PAYLOAD,
      adminAccount: "system:notification-dispatch",
    }),
    "delivery log unavailable",
  );

  assertEquals(test.observations.sent.length, 1);
  assertEquals(test.observations.successes, [
    { subscriptionId: "subscription-a", at: "2026-09-03T08:50:00.000Z" },
  ]);
  assertEquals(test.observations.failures, []);
});

for (const endpoint of [
  'https://127.0.0.1/a','https://169.254.169.254/a','https://[::1]/a',
  'http://fcm.googleapis.com/a','https://attacker.example/a',
  'https://fcm.googleapis.com.attacker.example/a','https://user@fcm.googleapis.com/a',
  'https://fcm.googleapis.com:443/a','https://fcm.googleapis.com/a#fragment',
  'https://%66cm.googleapis.com/a','https://fcm.googleapis.com\\@attacker.example/a',
]) {
  Deno.test(`shared delivery blocks an unsafe endpoint before sending: ${endpoint}`, async () => {
    const fixture = setup();
    const result = await deliverPushToSubscription(fixture.dependencies, {
      userId:'user-1',subscription:{...SUBSCRIPTION,endpoint},payload:PAYLOAD,adminAccount:'system:notification-dispatch',
    });
    assertEquals(result.delivered,false);
    assertEquals(result.permanentFailure,true);
    assertEquals(result.failureReason,'INVALID_PUSH_SUBSCRIPTION');
    assertEquals(fixture.observations.sent,[]);
    assertEquals(fixture.observations.failures[0].disable,true);
  });
}

Deno.test("shared delivery supports browser providers and rejects malformed destinations", async () => {
  for (const endpoint of [
    "https://updates.push.services.mozilla.com/wpush/v2/test",
    "https://web.push.apple.com/test",
    "https://wns2.notify.windows.com/test",
  ]) {
    const fixture = setup();
    const result = await deliverPushToSubscription(fixture.dependencies, {
      userId: "user-1", subscription: { ...SUBSCRIPTION, endpoint },
      payload: PAYLOAD, adminAccount: "system:notification-dispatch",
    });
    assertEquals(result.delivered, true);
    assertEquals(fixture.observations.sent.length, 1);
  }
  for (const endpoint of [
    "https://fcm.googleapis.com:8443/a",
    "https://fcm.googleapis.com@attacker.example/a",
    "https://fcm.googleapis.com/a\n",
    "https://fcm.googleapis.com/" + "a".repeat(4096),
  ]) {
    const fixture = setup();
    const result = await deliverPushToSubscription(fixture.dependencies, {
      userId: "user-1", subscription: { ...SUBSCRIPTION, endpoint },
      payload: PAYLOAD, adminAccount: "system:notification-dispatch",
    });
    assertEquals(result.permanentFailure, true);
    assertEquals(result.failureReason, "INVALID_PUSH_SUBSCRIPTION");
    assertEquals(fixture.observations.sent, []);
  }
});
