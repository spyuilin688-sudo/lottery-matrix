import "edge-runtime";
import { createClient } from "@supabase/supabase-js";
import {
  createNotificationIngestHandler,
  type NotificationEventResult,
} from "./handler.ts";

function secret(name: string) {
  const value = Deno.env.get(name)?.trim() ?? "";
  if (!value) throw new Error(`Missing required secret: ${name}`);
  return value;
}

const supabaseUrl = secret("SUPABASE_URL");
const serviceRoleKey = secret("SUPABASE_SERVICE_ROLE_KEY");
const notificationToken = secret("MATRIX_NOTIFICATION_INGEST_TOKEN");

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function normalizeResult(value: unknown): NotificationEventResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("INVALID_NOTIFICATION_EVENT_RESULT");
  }
  const result = value as Record<string, unknown>;
  const id = typeof result.id === "string" ? result.id : "";
  const eventKey = typeof result.eventKey === "string" ? result.eventKey : "";
  const created = result.created;
  const fanoutStatus = result.fanoutStatus;
  if (!id || !eventKey || typeof created !== "boolean") {
    throw new Error("INVALID_NOTIFICATION_EVENT_RESULT");
  }
  if (
    fanoutStatus !== "pending" &&
    fanoutStatus !== "processing" &&
    fanoutStatus !== "complete" &&
    fanoutStatus !== "failed"
  ) {
    throw new Error("INVALID_NOTIFICATION_EVENT_RESULT");
  }
  return { id, eventKey, created, fanoutStatus };
}

const handler = createNotificationIngestHandler({
  notificationToken,
  async enqueue(event) {
    const { data, error } = await supabase.rpc("notification_event_enqueue_server", {
      p_event_key: event.eventKey,
      p_event_type: event.eventType,
      p_source: event.source,
      p_occurred_at: event.occurredAt,
      p_payload: event.payload,
    });
    if (error) throw error;
    return normalizeResult(data);
  },
});

Deno.serve(handler);
