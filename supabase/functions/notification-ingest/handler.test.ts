import {
  createNotificationIngestHandler,
  type NotificationEventInput,
  type NotificationEventResult,
} from "./handler.ts";

function assertEquals(actual: unknown, expected: unknown) {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(`Expected ${expectedJson}, received ${actualJson}`);
  }
}

const TOKEN = "notification-ingest-token";

function request(
  body: unknown,
  token: string | null = TOKEN,
  method = "POST",
) {
  const headers = new Headers({ "Content-Type": "application/json" });
  if (token !== null) headers.set("x-matrix-notification-token", token);
  return new Request("https://project.supabase.co/functions/v1/notification-ingest", {
    method,
    headers,
    body: method === "POST" ? JSON.stringify(body) : undefined,
  });
}

const RESULT_EVENT = {
  eventKey: "lottery_result:539:115207",
  eventType: "lottery_result",
  source: "railway",
  occurredAt: "2026-09-03T09:00:00.000Z",
  payload: {
    lottery: "今彩539",
    lotteryCode: "539",
    period: "115207",
    numbers: ["01", "02", "03", "04", "05"],
    drawDate: "2026-09-03",
  },
};

Deno.test("notification ingest preserves the draw date on card and status events", async () => {
  for (const eventType of ["matrix_card", "matrix_status"] as const) {
    const test = setup();
    const payload = { lottery: "今彩539", lotteryCode: "539", period: "115000216", drawDate: "2026-09-05",
      ...(eventType === "matrix_status" ? { status: "CRITICAL", statusLabel: "臨界" } : {}) };
    const response = await test.handler(request({ eventKey: `${eventType}:539:115000216`, eventType, source: "railway", occurredAt: "2026-09-06T00:01:00Z", payload }));
    assertEquals(response.status, 200);
    assertEquals(test.events[0].payload, payload);
    const invalid = await test.handler(request({ eventKey: `${eventType}:539:115000216`, eventType, source: "railway", occurredAt: "2026-09-06T00:01:00Z", payload: { ...payload, drawDate: "2026-02-30" } }));
    assertEquals(invalid.status, 400);
  }
});

function setup(result: NotificationEventResult = {
  id: "event-1",
  eventKey: RESULT_EVENT.eventKey,
  created: true,
  fanoutStatus: "pending",
}) {
  const events: NotificationEventInput[] = [];
  return {
    events,
    handler: createNotificationIngestHandler({
      notificationToken: TOKEN,
      async enqueue(event) {
        events.push(event);
        return result;
      },
    }),
  };
}

Deno.test("notification ingest accepts OPTIONS without enqueueing", async () => {
  const test = setup();
  const response = await test.handler(request({}, null, "OPTIONS"));
  assertEquals(response.status, 200);
  assertEquals(test.events, []);
});

Deno.test("notification ingest rejects unsupported methods", async () => {
  const test = setup();
  const response = await test.handler(request({}, TOKEN, "GET"));
  assertEquals(response.status, 405);
  assertEquals(test.events, []);
});

Deno.test("notification ingest requires the custom token", async () => {
  const test = setup();
  const response = await test.handler(request(RESULT_EVENT, null));
  assertEquals(response.status, 401);
  assertEquals(test.events, []);
});

Deno.test("notification ingest rejects an incorrect custom token", async () => {
  const test = setup();
  const response = await test.handler(request(RESULT_EVENT, "wrong-token"));
  assertEquals(response.status, 403);
  assertEquals(test.events, []);
});

Deno.test("notification ingest rejects unknown and DB-only event types", async () => {
  const test = setup();
  const unknown = await test.handler(request({ ...RESULT_EVENT, eventType: "unknown" }));
  const bet = await test.handler(request({
    ...RESULT_EVENT,
    eventType: "bet_reminder",
    source: "cron",
  }));
  const expiry = await test.handler(request({
    ...RESULT_EVENT,
    eventType: "membership_expiry",
    source: "cron",
  }));
  assertEquals([unknown.status, bet.status, expiry.status], [400, 400, 400]);
  assertEquals(test.events, []);
});

Deno.test("notification ingest enforces trusted source per event type", async () => {
  const test = setup();
  const railwayAsAdmin = await test.handler(request({ ...RESULT_EVENT, source: "admin" }));
  const systemAsRailway = await test.handler(request({
    eventKey: "system_notice:notice-1",
    eventType: "system_notice",
    source: "railway",
    occurredAt: "2026-09-03T09:00:00.000Z",
    payload: {
      noticeId: "notice-1",
      category: "更新",
      title: "更新通知",
      body: "系統已更新",
    },
  }));
  assertEquals([railwayAsAdmin.status, systemAsRailway.status], [400, 400]);
  assertEquals(test.events, []);
});

Deno.test("notification ingest rejects an event key that does not match payload", async () => {
  const test = setup();
  const response = await test.handler(request({
    ...RESULT_EVENT,
    eventKey: "lottery_result:539:wrong-period",
  }));
  assertEquals(response.status, 400);
  assertEquals(test.events, []);
});

Deno.test("notification ingest rejects malformed occurredAt and payload", async () => {
  const test = setup();
  const badDate = await test.handler(request({ ...RESULT_EVENT, occurredAt: "not-a-date" }));
  const badPayload = await test.handler(request({
    ...RESULT_EVENT,
    payload: { ...RESULT_EVENT.payload, numbers: "01,02,03,04,05" },
  }));
  const mismatchedLottery = await test.handler(request({
    ...RESULT_EVENT,
    payload: { ...RESULT_EVENT.payload, lottery: "大樂透" },
  }));
  assertEquals([badDate.status, badPayload.status, mismatchedLottery.status], [400, 400, 400]);
  assertEquals(test.events, []);
});

Deno.test("notification ingest validates matrix status label and deterministic key", async () => {
  const test = setup();
  const invalid = await test.handler(request({
    eventKey: "matrix_status:539:115207",
    eventType: "matrix_status",
    source: "railway",
    occurredAt: "2026-09-03T09:00:00.000Z",
    payload: {
      lottery: "今彩539",
      lotteryCode: "539",
      period: "115207",
      status: "ACTIVE",
      statusLabel: "臨界",
    },
  }));
  assertEquals(invalid.status, 400);
  assertEquals(test.events, []);
});

Deno.test("notification ingest validates system notice category and unicode code-point limits", async () => {
  const test = setup();
  const tooLongTitle = "😀".repeat(81);
  const tooLongBody = "字".repeat(241);
  const wrongCategory = await test.handler(request({
    eventKey: "system_notice:notice-1",
    eventType: "system_notice",
    source: "admin",
    occurredAt: "2026-09-03T09:00:00.000Z",
    payload: {
      noticeId: "notice-1",
      category: "其他",
      title: "通知",
      body: "內容",
    },
  }));
  const longTitle = await test.handler(request({
    eventKey: "system_notice:notice-2",
    eventType: "system_notice",
    source: "admin",
    occurredAt: "2026-09-03T09:00:00.000Z",
    payload: {
      noticeId: "notice-2",
      category: "更新",
      title: tooLongTitle,
      body: "內容",
    },
  }));
  const longBody = await test.handler(request({
    eventKey: "system_notice:notice-3",
    eventType: "system_notice",
    source: "admin",
    occurredAt: "2026-09-03T09:00:00.000Z",
    payload: {
      noticeId: "notice-3",
      category: "維護",
      title: "維護通知",
      body: tooLongBody,
    },
  }));
  assertEquals([wrongCategory.status, longTitle.status, longBody.status], [400, 400, 400]);
  assertEquals(test.events, []);
});

Deno.test("notification ingest enqueues a valid railway result exactly once", async () => {
  const test = setup();
  const response = await test.handler(request(RESULT_EVENT));
  assertEquals(response.status, 200);
  assertEquals(await response.json(), {
    id: "event-1",
    eventKey: RESULT_EVENT.eventKey,
    created: true,
    fanoutStatus: "pending",
  });
  assertEquals(test.events, [RESULT_EVENT]);
});

Deno.test("notification ingest accepts valid card and status events", async () => {
  const test = setup();
  const card = {
    eventKey: "matrix_card:lotto649:115208",
    eventType: "matrix_card",
    source: "railway",
    occurredAt: "2026-09-03T09:00:00.000Z",
    payload: {
      lottery: "大樂透",
      lotteryCode: "lotto649",
      period: "115208",
    },
  };
  const status = {
    eventKey: "matrix_status:marksix:115209",
    eventType: "matrix_status",
    source: "railway",
    occurredAt: "2026-09-03T09:01:00.000Z",
    payload: {
      lottery: "六合彩",
      lotteryCode: "marksix",
      period: "115209",
      status: "CRITICAL",
      statusLabel: "臨界",
    },
  };
  assertEquals((await test.handler(request(card))).status, 200);
  assertEquals((await test.handler(request(status))).status, 200);
  assertEquals(test.events, [card, status]);
});

Deno.test("notification ingest accepts one deterministic draw key across status upgrades", async () => {
  const test = setup();
  const resonance = {
    eventKey: "matrix_status:539:115210",
    eventType: "matrix_status",
    source: "railway",
    occurredAt: "2026-09-03T09:01:00.000Z",
    payload: {
      lottery: "今彩539",
      lotteryCode: "539",
      period: "115210",
      status: "RESONANCE",
      statusLabel: "共振",
    },
  };
  const critical = {
    ...resonance,
    occurredAt: "2026-09-03T09:02:00.000Z",
    payload: {
      ...resonance.payload,
      status: "CRITICAL",
      statusLabel: "臨界",
    },
  };

  assertEquals((await test.handler(request(resonance))).status, 200);
  assertEquals((await test.handler(request(critical))).status, 200);
  assertEquals(test.events, [resonance, critical]);
});

Deno.test("notification ingest rejects the legacy status-specific event key", async () => {
  const test = setup();
  const response = await test.handler(request({
    eventKey: "matrix_status:539:115210:CRITICAL",
    eventType: "matrix_status",
    source: "railway",
    occurredAt: "2026-09-03T09:02:00.000Z",
    payload: {
      lottery: "今彩539",
      lotteryCode: "539",
      period: "115210",
      status: "CRITICAL",
      statusLabel: "臨界",
    },
  }));

  assertEquals(response.status, 400);
  assertEquals(test.events, []);
});

Deno.test("notification ingest accepts a valid admin system notice", async () => {
  const test = setup();
  const notice = {
    eventKey: "system_notice:notice-4",
    eventType: "system_notice",
    source: "admin",
    occurredAt: "2026-09-03T09:00:00.000Z",
    payload: {
      noticeId: "notice-4",
      category: "更新",
      title: "😀".repeat(80),
      body: "更新內容",
    },
  };
  const response = await test.handler(request(notice));
  assertEquals(response.status, 200);
  assertEquals(test.events, [notice]);
});

Deno.test("duplicate valid event result still returns 200", async () => {
  const duplicateResult: NotificationEventResult = {
    id: "existing-event",
    eventKey: RESULT_EVENT.eventKey,
    created: false,
    fanoutStatus: "complete",
  };
  const test = setup(duplicateResult);
  const response = await test.handler(request(RESULT_EVENT));
  assertEquals(response.status, 200);
  assertEquals(await response.json(), duplicateResult);
  assertEquals(test.events, [RESULT_EVENT]);
});
