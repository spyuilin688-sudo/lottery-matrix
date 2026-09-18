import "edge-runtime";
import { createClient } from "@supabase/supabase-js";
import { createPilioNotificationHandler } from "./handler.ts";

function secret(name: string): string {
  const value = Deno.env.get(name)?.trim() ?? "";
  if (!value) throw new Error(`Missing required secret: ${name}`);
  return value;
}
const url = secret("SUPABASE_URL");
const token = secret("MATRIX_NOTIFICATION_DISPATCH_TOKEN");
const supabase = createClient(url, secret("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false, autoRefreshToken: false } });

Deno.serve(createPilioNotificationHandler({
  dispatchToken: token,
  async isRecorded(lottery, drawDate) {
    const { data, error } = await supabase.from("notification_events").select("id")
      .eq("event_type", "lottery_result").eq("payload->>lottery", lottery).eq("payload->>drawDate", drawDate).limit(1);
    if (error) throw error;
    return Boolean(data?.length);
  },
  async fetchPage(sourceUrl) {
    const response = await fetch(sourceUrl, { signal: AbortSignal.timeout(10_000), cache: "no-store" });
    if (!response.ok) throw new Error(`PILIO_HTTP_${response.status}`);
    const bytes = await response.arrayBuffer();
    if (bytes.byteLength > 2_000_000) throw new Error("PILIO_RESPONSE_TOO_LARGE");
    const prefix = new TextDecoder("ascii").decode(bytes.slice(0, 4096));
    const charset = /charset\s*=\s*["']?\s*([\w-]+)/i.exec(response.headers.get("content-type") ?? "")?.[1]
      ?? /charset\s*=\s*["']?\s*([\w-]+)/i.exec(prefix)?.[1] ?? "big5";
    return new TextDecoder(charset).decode(bytes);
  },
  async publish(result) {
    const { data, error } = await supabase.rpc("notification_fast_result_publish", {
      p_lottery_code: result.lotteryCode, p_draw_date: result.drawDate, p_numbers: result.numbers,
    });
    if (error) throw error;
    if (!data || typeof data.created !== "boolean") throw new Error("INVALID_FAST_RESULT_RESPONSE");
    return { created: data.created };
  },
  async dispatch() {
    const response = await fetch(`${url}/functions/v1/notification-dispatch`, {
      method: "POST", headers: { "x-matrix-dispatch-token": token, "Content-Type": "application/json" },
      body: "{}", signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error("DISPATCH_REQUEST_FAILED");
  },
  async requestProcessing(result) {
    const base = Deno.env.get("MATRIX_RAILWAY_API_BASE")?.trim()
      || "https://heartfelt-generosity-production-9f2b.up.railway.app";
    const response = await fetch(new URL("/jobs/result-ready", base), {
      method: "POST", redirect: "error",
      headers: { "Content-Type": "application/json", "x-matrix-notification-token": secret("MATRIX_NOTIFICATION_INGEST_TOKEN") },
      body: JSON.stringify({ lottery: result.lottery, drawDate: result.drawDate }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error("RESULT_PROCESSING_REQUEST_FAILED");
  },
}));
