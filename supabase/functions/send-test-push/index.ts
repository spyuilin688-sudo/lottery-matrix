import "edge-runtime";
import { createClient } from "@supabase/supabase-js";
// @ts-types="web-push-types"
import webpush from "web-push";
import {
  createSendTestPushHandler,
  type DeliveryLog,
  type PushPayload,
  type PushSubscription,
} from "./handler.ts";
import {
  createSendTestPushRuntime,
} from "./startup.ts";

let supabase: ReturnType<typeof createClient>;

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

async function sendPush(
  subscription: PushSubscription,
  payload: PushPayload,
) {
  await webpush.sendNotification(
    {
      endpoint: subscription.endpoint,
      keys: {
        p256dh: subscription.p256dh,
        auth: subscription.authKey,
      },
    },
    JSON.stringify(payload),
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

async function markFailure(
  subscriptionId: string,
  at: string,
  disable: boolean,
) {
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

const handler = createSendTestPushRuntime({
  getEnv: (name) => Deno.env.get(name),
  createSupabaseClient: (url, serviceRoleKey) =>
    createClient(url, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    }),
  configureWebPush: (subject, publicKey, privateKey) =>
    webpush.setVapidDetails(subject, publicKey, privateKey),
  createHandler: ({ serviceRoleKey, supabase: initializedSupabase }) => {
    supabase = initializedSupabase;
    return createSendTestPushHandler({
      serviceRoleKey,
      listSubscriptions,
      sendPush,
      recordDelivery,
      markSuccess,
      markFailure,
    });
  },
});

Deno.serve(handler);
