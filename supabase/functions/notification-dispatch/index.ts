import "edge-runtime";
import { createClient } from "@supabase/supabase-js";
// @ts-types="web-push-types"
import webpush from "web-push";
import { createNotificationFetch } from "./transport.ts";
import {
  createNotificationDispatchHandler,
  type ClaimedNotificationWork,
} from "./handler.ts";
import { PUSH_OPERATION_TIMEOUT_MS } from "../_shared/web-push-delivery.ts";
import type {
  DeliveryLog,
  PushPayload,
  PushSubscription,
} from "../_shared/web-push-delivery.ts";

function secret(name: string) {
  const value = Deno.env.get(name)?.trim() ?? "";
  if (!value) throw new Error(`Missing required secret: ${name}`);
  return value;
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function requiredString(value: unknown) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("INVALID_DISPATCH_RPC_RESULT");
  }
  return value;
}

function normalizePayload(value: unknown): PushPayload {
  const payload = record(value);
  if (!payload) throw new Error("INVALID_DISPATCH_RPC_RESULT");
  const title = requiredString(payload.title);
  const body = requiredString(payload.body);
  const url = requiredString(payload.url);
  const tag = payload.tag;
  if (tag !== undefined && typeof tag !== "string") {
    throw new Error("INVALID_DISPATCH_RPC_RESULT");
  }
  return { title, body, url, ...(tag === undefined ? {} : { tag }) };
}

function normalizeClaimedWork(value: unknown): ClaimedNotificationWork {
  const work = record(value);
  if (!work) throw new Error("INVALID_DISPATCH_RPC_RESULT");
  const attemptCount = work.attemptCount;
  if (!Number.isInteger(attemptCount) || (attemptCount as number) < 1) {
    throw new Error("INVALID_DISPATCH_RPC_RESULT");
  }
  return {
    outboxId: requiredString(work.outboxId),
    memberId: requiredString(work.memberId),
    userId: requiredString(work.userId),
    eventId: requiredString(work.eventId),
    eventKey: requiredString(work.eventKey),
    payload: normalizePayload(work.payload),
    attemptCount: attemptCount as number,
  };
}

function normalizeBoolean(value: unknown) {
  if (typeof value !== "boolean") throw new Error("INVALID_DISPATCH_RPC_RESULT");
  return value;
}

const supabaseUrl = secret("SUPABASE_URL");
const serviceRoleKey = secret("SUPABASE_SERVICE_ROLE_KEY");
const dispatchToken = secret("MATRIX_NOTIFICATION_DISPATCH_TOKEN");
const publicKey = secret("WEB_PUSH_PUBLIC_KEY");
const privateKey = secret("WEB_PUSH_PRIVATE_KEY");
const subject = secret("WEB_PUSH_SUBJECT");

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { fetch: createNotificationFetch() },
});

webpush.setVapidDetails(subject, publicKey, privateKey);

async function claim(limit: number): Promise<ClaimedNotificationWork[]> {
  const { data, error } = await supabase.rpc("notification_dispatch_claim", {
    p_limit: limit,
    p_now: new Date().toISOString(),
  });
  if (error) throw error;
  if (!Array.isArray(data)) throw new Error("INVALID_DISPATCH_RPC_RESULT");
  return data.map(normalizeClaimedWork);
}

async function listSubscriptions(userId: string): Promise<PushSubscription[]> {
  const { data, error } = await supabase
    .from("member_push_subscriptions")
    .select("id, endpoint, p256dh, auth_key")
    .eq("user_id", userId)
    .eq("enabled", true);
  if (error) throw error;
  return (data ?? []).map((subscription) => ({
    id: subscription.id,
    endpoint: subscription.endpoint,
    p256dh: subscription.p256dh,
    authKey: subscription.auth_key,
  }));
}

async function sendPush(subscription: PushSubscription, payload: PushPayload) {
  await webpush.sendNotification(
    {
      endpoint: subscription.endpoint,
      keys: { p256dh: subscription.p256dh, auth: subscription.authKey },
    },
    JSON.stringify(payload),
    { timeout: PUSH_OPERATION_TIMEOUT_MS },
  );
}

async function recordDelivery(log: DeliveryLog) {
  const { error } = await supabase.from("push_delivery_logs").insert({
    user_id: log.userId,
    subscription_id: log.subscriptionId,
    title: log.title,
    body: log.body,
    status: log.status,
    failure_reason: log.failureReason,
    admin_account: log.adminAccount,
    sent_at: log.sentAt,
  });
  if (error) throw error;
}

async function markSuccess(subscriptionId: string, at: string) {
  const { error } = await supabase
    .from("member_push_subscriptions")
    .update({ last_success_at: at, updated_at: at })
    .eq("id", subscriptionId);
  if (error) throw error;
}

async function markFailure(subscriptionId: string, at: string, disable: boolean) {
  const values: Record<string, string | boolean> = {
    last_failure_at: at,
    updated_at: at,
  };
  if (disable) values.enabled = false;
  const { error } = await supabase
    .from("member_push_subscriptions")
    .update(values)
    .eq("id", subscriptionId);
  if (error) throw error;
}

async function markSent(outboxId: string, processedAt: string) {
  const { data, error } = await supabase.rpc("notification_dispatch_mark_sent", {
    p_outbox_id: outboxId,
    p_processed_at: processedAt,
  });
  if (error) throw error;
  return normalizeBoolean(data);
}

async function markSkipped(outboxId: string, reason: string, processedAt: string) {
  const { data, error } = await supabase.rpc("notification_dispatch_mark_skipped", {
    p_outbox_id: outboxId,
    p_reason: reason,
    p_processed_at: processedAt,
  });
  if (error) throw error;
  return normalizeBoolean(data);
}

async function markRetry(outboxId: string, failure: string, nextAttemptAt: string) {
  const { data, error } = await supabase.rpc("notification_dispatch_mark_retry", {
    p_outbox_id: outboxId,
    p_error: failure,
    p_next_attempt_at: nextAttemptAt,
  });
  if (error) throw error;
  return normalizeBoolean(data);
}

async function markFailed(outboxId: string, failure: string, processedAt: string) {
  const { data, error } = await supabase.rpc("notification_dispatch_mark_failed", {
    p_outbox_id: outboxId,
    p_error: failure,
    p_processed_at: processedAt,
  });
  if (error) throw error;
  return normalizeBoolean(data);
}

const handler = createNotificationDispatchHandler({
  dispatchToken,
  claim,
  listSubscriptions,
  sendPush,
  recordDelivery,
  markSuccess,
  markFailure,
  markSent,
  markSkipped,
  markRetry,
  markFailed,
});

Deno.serve(handler);
