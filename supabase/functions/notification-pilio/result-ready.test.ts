import { describe, expect, it } from "vitest";
import { requestResultProcessing } from "./result-ready.ts";

const result = { lottery: "今彩539", drawDate: "2026-09-23" };

describe("result-ready worker wake-up", () => {
  it("posts a newly fetched result to the recovery service by default", async () => {
    let outgoing: Request | undefined;
    const fetcher: typeof fetch = async (input, init) => {
      outgoing = new Request(input, init);
      return new Response(null, { status: 202 });
    };

    const environment = new Map([["MATRIX_RAILWAY_API_BASE", "https://heartfelt-generosity-production-9f2b.up.railway.app"]]);
    await requestResultProcessing(result, "ingest-token", environment, fetcher);

    expect(outgoing?.url).toBe("https://matrix-recovery-production.up.railway.app/jobs/result-ready");
    expect(outgoing?.method).toBe("POST");
    expect(outgoing?.headers.get("x-matrix-notification-token")).toBe("ingest-token");
    expect(await outgoing?.json()).toEqual(result);
  });

  it("uses the dedicated worker base when provided", async () => {
    let outgoing: Request | undefined;
    const fetcher: typeof fetch = async (input, init) => {
      outgoing = new Request(input, init);
      return new Response(null, { status: 202 });
    };

    const environment = new Map([["MATRIX_RESULT_READY_API_BASE", "https://recovery.example.test/"]]);
    await requestResultProcessing(result, "ingest-token", environment, fetcher);

    expect(outgoing?.url).toBe("https://recovery.example.test/jobs/result-ready");
  });

  it("reports a failed worker wake-up for the scheduled retry", async () => {
    const fetcher: typeof fetch = async () => new Response(null, { status: 404 });

    await expect(requestResultProcessing(result, "ingest-token", new Map(), fetcher))
      .rejects.toThrow("RESULT_PROCESSING_REQUEST_FAILED");
  });
});
