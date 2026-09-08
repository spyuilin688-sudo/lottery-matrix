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
  tag?: string;
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

export type PushDeliveryResult = {
  delivered: boolean;
  permanentFailure: boolean;
  failureReason: string | null;
  sentAt: string;
};

export type DeliveryDependencies = {
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

function failureReason(cause: unknown) {
  if (cause instanceof Error && cause.message.trim()) return cause.message;
  return "Push delivery failed";
}

function expiredEndpoint(cause: unknown) {
  if (!cause || typeof cause !== "object") return false;
  const statusCode = Reflect.get(cause, "statusCode");
  return statusCode === 404 || statusCode === 410;
}

function allowedEndpoint(endpoint: unknown): boolean {
  if (
    typeof endpoint !== "string" || endpoint.length > 4096 ||
    /[\s\\#\u0000-\u001f\u007f]/.test(endpoint)
  ) return false;

  try {
    const url = new URL(endpoint);
    const authority = /^https:\/\/([^/?#]+)/.exec(endpoint)?.[1];
    // Compare the raw authority to reject credentials, ports and encoded hosts.
    if (!authority || authority.toLowerCase() !== url.hostname) return false;
    return url.protocol === "https:" && !url.username && !url.password &&
      !url.port &&
      /^(fcm\.googleapis\.com|([a-z0-9-]+\.)*push\.services\.mozilla\.com|([a-z0-9-]+\.)*web\.push\.apple\.com|([a-z0-9-]+\.)*notify\.windows\.com)$/.test(url.hostname);
  } catch {
    return false;
  }
}

export async function deliverPushToSubscription(
  dependencies: DeliveryDependencies,
  input: {
    userId: string;
    subscription: PushSubscription;
    payload: PushPayload;
    adminAccount: string;
  },
): Promise<PushDeliveryResult> {
  const sentAt = (dependencies.now ?? (() => new Date()))().toISOString();
  const invalidEndpoint = !allowedEndpoint(input.subscription.endpoint);
  let delivered = false;
  let sendFailure: unknown;

  try {
    if (invalidEndpoint) throw new Error("INVALID_PUSH_SUBSCRIPTION");
    await dependencies.sendPush(input.subscription, input.payload);
    delivered = true;
  } catch (cause) {
    sendFailure = cause;
  }

  if (delivered) {
    await dependencies.markSuccess(input.subscription.id, sentAt);
    await dependencies.recordDelivery({
      userId: input.userId,
      subscriptionId: input.subscription.id,
      title: input.payload.title,
      body: input.payload.body,
      status: "sent",
      failureReason: null,
      adminAccount: input.adminAccount,
      sentAt,
    });
    return {
      delivered: true,
      permanentFailure: false,
      failureReason: null,
      sentAt,
    };
  }

  const permanentFailure = invalidEndpoint || expiredEndpoint(sendFailure);
  const reason = failureReason(sendFailure);
  await dependencies.markFailure(
    input.subscription.id,
    sentAt,
    permanentFailure,
  );
  await dependencies.recordDelivery({
    userId: input.userId,
    subscriptionId: input.subscription.id,
    title: input.payload.title,
    body: input.payload.body,
    status: "failed",
    failureReason: reason,
    adminAccount: input.adminAccount,
    sentAt,
  });

  return {
    delivered: false,
    permanentFailure,
    failureReason: reason,
    sentAt,
  };
}
