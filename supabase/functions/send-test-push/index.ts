import "edge-runtime";
import { createClient } from "@supabase/supabase-js";
// @ts-types="web-push-types"
import webpush from "web-push";
import { createSendTestPushHandler } from "./handler.ts";
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

const supabaseUrl = secret("SUPABASE_URL");
const serviceRoleKey = secret("SUPABASE_SERVICE_ROLE_KEY");
const publicKey = secret("WEB_PUSH_PUBLIC_KEY");
const privateKey = secret("WEB_PUSH_PRIVATE_KEY");
const subject = secret("WEB_PUSH_SUBJECT");

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

webpush.setVapidDetails(subject, publicKey, privateKey);

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

const handler = createSendTestPushHandler({
  serviceRoleKey,
  listSubscriptions,
  sendPush,
  recordDelivery,
  markSuccess,
  markFailure,
});

Deno.serve(handler);
