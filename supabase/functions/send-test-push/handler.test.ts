import {
  createSendTestPushHandler,
  type DeliveryLog,
  type PushPayload,
  type PushSubscription,
} from "./handler.ts";

function assertEquals(actual: unknown, expected: unknown) {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(`Expected ${expectedJson}, received ${actualJson}`);
  }
}

const SERVICE_ROLE_KEY = "test-service-role-key";
const SUBSCRIPTION_A: PushSubscription = {
  id: "subscription-a",
  endpoint: "https://push.example/a",
  p256dh: "p256dh-a",
  authKey: "auth-a",
};
const SUBSCRIPTION_B: PushSubscription = {
  id: "subscription-b",
  endpoint: "https://push.example/b",
  p256dh: "p256dh-b",
  authKey: "auth-b",
};
const FIXED_PAYLOAD: PushPayload = {
  title: "樂彩 Matrix 測試通知",
  body: "手機推播已成功啟用",
  url: "/",
};

function request(
  body: unknown,
  authorization = `Bearer ${SERVICE_ROLE_KEY}`,
) {
  return new Request(
    "https://project.supabase.co/functions/v1/send-test-push",
    {
      method: "POST",
      headers: {
        Authorization: authorization,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
  );
}

function dependencies(overrides: {
  listSubscriptions?: (userId: string) => Promise<PushSubscription[]>;
  sendPush?: (
    subscription: PushSubscription,
    payload: PushPayload,
  ) => Promise<void>;
  recordDelivery?: (log: DeliveryLog) => Promise<void>;
} = {}) {
  const logs: DeliveryLog[] = [];
  const successes: Array<{ subscriptionId: string; at: string }> = [];
  const failures: Array<{
    subscriptionId: string;
    at: string;
    disable: boolean;
  }> = [];
  const listedUserIds: string[] = [];
  const sent: Array<{
    subscription: PushSubscription;
    payload: PushPayload;
  }> = [];

  return {
    observations: { logs, successes, failures, listedUserIds, sent },
    value: {
      serviceRoleKey: SERVICE_ROLE_KEY,
      now: () => new Date("2026-08-30T07:00:00.000Z"),
      listSubscriptions(userId: string) {
        listedUserIds.push(userId);
        return overrides.listSubscriptions?.(userId) ??
          Promise.resolve([SUBSCRIPTION_A]);
      },
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
      markFailure(
        subscriptionId: string,
        at: string,
        disable: boolean,
      ) {
        failures.push({ subscriptionId, at, disable });
        return Promise.resolve();
      },
    },
  };
}

Deno.test("未提供會員時回傳 400", async () => {
  const setup = dependencies();
  const handler = createSendTestPushHandler(setup.value);

  const response = await handler(request({ adminAccount: "admin@test" }));

  assertEquals(response.status, 400);
  assertEquals(setup.observations.listedUserIds, []);
});

Deno.test("拒絕非 service role 呼叫", async () => {
  const setup = dependencies();
  const handler = createSendTestPushHandler(setup.value);

  const missing = await handler(
    request({ userId: "member-1", adminAccount: "admin@test" }, ""),
  );
  const wrong = await handler(
    request(
      { userId: "member-1", adminAccount: "admin@test" },
      "Bearer member-token",
    ),
  );

  assertEquals(missing.status, 401);
  assertEquals(wrong.status, 403);
  assertEquals(setup.observations.listedUserIds, []);
});

Deno.test("沒有有效訂閱時回傳 409", async () => {
  const setup = dependencies({
    listSubscriptions: () => Promise.resolve([]),
  });
  const handler = createSendTestPushHandler(setup.value);

  const response = await handler(
    request({ userId: "member-1", adminAccount: "admin@test" }),
  );

  assertEquals(response.status, 409);
  assertEquals(setup.observations.listedUserIds, ["member-1"]);
});

Deno.test("逐筆保存成功與失敗結果", async () => {
  const expired = Object.assign(new Error("expired endpoint"), {
    statusCode: 410,
  });
  let attempts = 0;
  const setup = dependencies({
    listSubscriptions: () => Promise.resolve([SUBSCRIPTION_A, SUBSCRIPTION_B]),
    sendPush: () => {
      attempts += 1;
      return attempts === 2 ? Promise.reject(expired) : Promise.resolve();
    },
  });
  const handler = createSendTestPushHandler(setup.value);

  const response = await handler(
    request({ userId: "member-1", adminAccount: "admin@test" }),
  );

  assertEquals(response.status, 200);
  assertEquals(await response.json(), { sent: 1, failed: 1 });
  assertEquals(
    setup.observations.sent.map(({ subscription, payload }) => ({
      subscriptionId: subscription.id,
      payload,
    })),
    [
      { subscriptionId: "subscription-a", payload: FIXED_PAYLOAD },
      { subscriptionId: "subscription-b", payload: FIXED_PAYLOAD },
    ],
  );
  assertEquals(setup.observations.logs, [
    {
      userId: "member-1",
      subscriptionId: "subscription-a",
      title: FIXED_PAYLOAD.title,
      body: FIXED_PAYLOAD.body,
      status: "sent",
      failureReason: null,
      adminAccount: "admin@test",
      sentAt: "2026-08-30T07:00:00.000Z",
    },
    {
      userId: "member-1",
      subscriptionId: "subscription-b",
      title: FIXED_PAYLOAD.title,
      body: FIXED_PAYLOAD.body,
      status: "failed",
      failureReason: "expired endpoint",
      adminAccount: "admin@test",
      sentAt: "2026-08-30T07:00:00.000Z",
    },
  ]);
  assertEquals(setup.observations.successes, [
    {
      subscriptionId: "subscription-a",
      at: "2026-08-30T07:00:00.000Z",
    },
  ]);
  assertEquals(setup.observations.failures, [
    {
      subscriptionId: "subscription-b",
      at: "2026-08-30T07:00:00.000Z",
      disable: true,
    },
  ]);
});

Deno.test("可重試的失敗不會停用 endpoint", async () => {
  const setup = dependencies({
    sendPush: () => Promise.reject(new Error("temporary provider failure")),
  });
  const handler = createSendTestPushHandler(setup.value);

  const response = await handler(
    request({ userId: "member-1", adminAccount: "admin@test" }),
  );

  assertEquals(await response.json(), { sent: 0, failed: 1 });
  assertEquals(setup.observations.failures, [
    {
      subscriptionId: "subscription-a",
      at: "2026-08-30T07:00:00.000Z",
      disable: false,
    },
  ]);
});

Deno.test("已成功送出不因 log 寫入錯誤被誤標為推播失敗", async () => {
  const setup = dependencies({
    recordDelivery: () => Promise.reject(new Error("database unavailable")),
  });
  const handler = createSendTestPushHandler(setup.value);
  let rejected = false;

  try {
    await handler(request({ userId: "member-1", adminAccount: "admin@test" }));
  } catch {
    rejected = true;
  }

  assertEquals(rejected, true);
  assertEquals(setup.observations.successes.length, 1);
  assertEquals(setup.observations.failures, []);
});
