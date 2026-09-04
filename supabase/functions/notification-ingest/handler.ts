export type LotteryName = "今彩539" | "天天樂" | "六合彩" | "大樂透";
export type LotteryCode = "539" | "fantasy5" | "marksix" | "lotto649";
export type MatrixStatus = "ACTIVE" | "FOCUS" | "RESONANCE" | "CRITICAL";
export type MatrixStatusLabel = "啟動" | "聚合" | "共振" | "臨界";

export type LotteryResultPayload = {
  lottery: LotteryName;
  lotteryCode: LotteryCode;
  period: string;
  numbers: string[];
  drawDate: string;
};

export type MatrixStatusPayload = {
  lottery: LotteryName;
  lotteryCode: LotteryCode;
  period: string;
  status: MatrixStatus;
  statusLabel: MatrixStatusLabel;
};

export type MatrixCardPayload = {
  lottery: LotteryName;
  lotteryCode: LotteryCode;
  period: string;
};

export type SystemNoticePayload = {
  noticeId: string;
  category: "維護" | "更新";
  title: string;
  body: string;
};

export type NotificationEventInput =
  | {
    eventKey: string;
    eventType: "lottery_result";
    source: "railway";
    occurredAt: string;
    payload: LotteryResultPayload;
  }
  | {
    eventKey: string;
    eventType: "matrix_status";
    source: "railway";
    occurredAt: string;
    payload: MatrixStatusPayload;
  }
  | {
    eventKey: string;
    eventType: "matrix_card";
    source: "railway";
    occurredAt: string;
    payload: MatrixCardPayload;
  }
  | {
    eventKey: string;
    eventType: "system_notice";
    source: "admin";
    occurredAt: string;
    payload: SystemNoticePayload;
  };

export type NotificationEventResult = {
  id: string;
  eventKey: string;
  created: boolean;
  fanoutStatus: "pending" | "processing" | "complete" | "failed";
};

type Dependencies = {
  notificationToken: string;
  enqueue(event: NotificationEventInput): Promise<NotificationEventResult>;
};

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "content-type, x-matrix-notification-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const LOTTERY_CODES: Record<LotteryName, LotteryCode> = {
  今彩539: "539",
  天天樂: "fantasy5",
  六合彩: "marksix",
  大樂透: "lotto649",
};

const STATUS_LABELS: Record<MatrixStatus, MatrixStatusLabel> = {
  ACTIVE: "啟動",
  FOCUS: "聚合",
  RESONANCE: "共振",
  CRITICAL: "臨界",
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

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function strictString(value: unknown): string | null {
  if (typeof value !== "string" || !value || value !== value.trim()) return null;
  return value;
}

function validTimestamp(value: string) {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) &&
    Number.isFinite(Date.parse(value));
}

function validDateOnly(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function codePointLength(value: string) {
  return Array.from(value).length;
}

function validText(value: unknown, maxCodePoints: number): value is string {
  return typeof value === "string" &&
    value.trim().length > 0 &&
    codePointLength(value) <= maxCodePoints;
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

function lotteryPair(payload: Record<string, unknown>) {
  const lottery = strictString(payload.lottery) as LotteryName | null;
  const lotteryCode = strictString(payload.lotteryCode) as LotteryCode | null;
  if (!lottery || !lotteryCode || !(lottery in LOTTERY_CODES)) return null;
  if (LOTTERY_CODES[lottery] !== lotteryCode) return null;
  return { lottery, lotteryCode };
}

function parseLotteryResult(payload: Record<string, unknown>): LotteryResultPayload | null {
  const pair = lotteryPair(payload);
  const period = strictString(payload.period);
  const drawDate = strictString(payload.drawDate);
  const numbers = payload.numbers;
  if (!pair || !period || !drawDate || !validDateOnly(drawDate) || !Array.isArray(numbers) || numbers.length === 0) {
    return null;
  }
  const normalizedNumbers: string[] = [];
  for (const number of numbers) {
    const normalized = strictString(number);
    if (!normalized) return null;
    normalizedNumbers.push(normalized);
  }
  return { ...pair, period, numbers: normalizedNumbers, drawDate };
}

function parseMatrixStatus(payload: Record<string, unknown>): MatrixStatusPayload | null {
  const pair = lotteryPair(payload);
  const period = strictString(payload.period);
  const status = strictString(payload.status) as MatrixStatus | null;
  const statusLabel = strictString(payload.statusLabel) as MatrixStatusLabel | null;
  if (!pair || !period || !status || !statusLabel || !(status in STATUS_LABELS)) return null;
  if (STATUS_LABELS[status] !== statusLabel) return null;
  return { ...pair, period, status, statusLabel };
}

function parseMatrixCard(payload: Record<string, unknown>): MatrixCardPayload | null {
  const pair = lotteryPair(payload);
  const period = strictString(payload.period);
  if (!pair || !period) return null;
  return { ...pair, period };
}

function parseSystemNotice(payload: Record<string, unknown>): SystemNoticePayload | null {
  const noticeId = strictString(payload.noticeId);
  const category = strictString(payload.category);
  const title = payload.title;
  const body = payload.body;
  if (!noticeId || (category !== "維護" && category !== "更新")) return null;
  if (!validText(title, 80) || !validText(body, 240)) return null;
  return { noticeId, category, title, body };
}

function parseEvent(value: unknown): NotificationEventInput | null {
  const input = record(value);
  if (!input) return null;
  const eventKey = strictString(input.eventKey);
  const eventType = strictString(input.eventType);
  const source = strictString(input.source);
  const occurredAt = strictString(input.occurredAt);
  const rawPayload = record(input.payload);
  if (!eventKey || !eventType || !source || !occurredAt || !validTimestamp(occurredAt) || !rawPayload) return null;

  if (eventType === "lottery_result") {
    if (source !== "railway") return null;
    const payload = parseLotteryResult(rawPayload);
    if (!payload) return null;
    if (eventKey !== `lottery_result:${payload.lotteryCode}:${payload.period}`) return null;
    return { eventKey, eventType, source, occurredAt, payload };
  }

  if (eventType === "matrix_status") {
    if (source !== "railway") return null;
    const payload = parseMatrixStatus(rawPayload);
    if (!payload) return null;
    if (eventKey !== `matrix_status:${payload.lotteryCode}:${payload.period}:${payload.status}`) return null;
    return { eventKey, eventType, source, occurredAt, payload };
  }

  if (eventType === "matrix_card") {
    if (source !== "railway") return null;
    const payload = parseMatrixCard(rawPayload);
    if (!payload) return null;
    if (eventKey !== `matrix_card:${payload.lotteryCode}:${payload.period}`) return null;
    return { eventKey, eventType, source, occurredAt, payload };
  }

  if (eventType === "system_notice") {
    if (source !== "admin") return null;
    const payload = parseSystemNotice(rawPayload);
    if (!payload) return null;
    if (eventKey !== `system_notice:${payload.noticeId}`) return null;
    return { eventKey, eventType, source, occurredAt, payload };
  }

  return null;
}

export function createNotificationIngestHandler(dependencies: Dependencies) {
  return async (request: Request): Promise<Response> => {
    if (request.method === "OPTIONS") {
      return new Response("ok", { headers: CORS_HEADERS });
    }
    if (request.method !== "POST") {
      return json({ error: { code: "METHOD_NOT_ALLOWED" } }, 405);
    }

    const suppliedToken = request.headers.get("x-matrix-notification-token")?.trim() ?? "";
    if (!suppliedToken) return json({ error: { code: "AUTH_REQUIRED" } }, 401);
    if (!dependencies.notificationToken || !constantTimeEqual(suppliedToken, dependencies.notificationToken)) {
      return json({ error: { code: "INVALID_TOKEN" } }, 403);
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return json({ error: { code: "INVALID_REQUEST" } }, 400);
    }

    const event = parseEvent(body);
    if (!event) return json({ error: { code: "INVALID_EVENT" } }, 400);

    try {
      const result = await dependencies.enqueue(event);
      return json(result, 200);
    } catch {
      return json({ error: { code: "EVENT_ENQUEUE_FAILED" } }, 500);
    }
  };
}
