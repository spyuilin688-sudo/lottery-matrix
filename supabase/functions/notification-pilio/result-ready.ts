import type { PilioResult } from "./pilio.ts";

export async function requestResultProcessing(
  result: Pick<PilioResult, "lottery" | "drawDate">,
  token: string,
  environment: { get(name: string): string | undefined },
  fetcher: typeof fetch = fetch,
): Promise<void> {
  const base = environment.get("MATRIX_RESULT_READY_API_BASE")?.trim()
    || "https://matrix-recovery-production.up.railway.app";
  const response = await fetcher(new URL("/jobs/result-ready", base), {
    method: "POST", redirect: "error",
    headers: { "Content-Type": "application/json", "x-matrix-notification-token": token },
    body: JSON.stringify({ lottery: result.lottery, drawDate: result.drawDate }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error("RESULT_PROCESSING_REQUEST_FAILED");
}
