import { describe, expect, it } from "vitest";
import {
  createSendTestPushRuntime,
  createSafeSendTestPushHandler,
  SendTestPushStartupError,
} from "../supabase/functions/send-test-push/startup.ts";

const SECRETS: Record<string, string> = {
  SUPABASE_URL: "https://project.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
  WEB_PUSH_PUBLIC_KEY: "public-key",
  WEB_PUSH_PRIVATE_KEY: "private-key",
  WEB_PUSH_SUBJECT: "mailto:admin@example.com",
};

function runtimeDependencies(overrides: {
  getEnv?: (name: string) => string | undefined;
  configureWebPush?: () => void;
  reportDiagnostic?: (diagnostic: unknown) => void;
} = {}) {
  return {
    getEnv: overrides.getEnv ?? ((name: string) => SECRETS[name]),
    createSupabaseClient: () => ({ client: "supabase" }),
    configureWebPush: overrides.configureWebPush ?? (() => undefined),
    createHandler: () => () => new Response(null, { status: 204 }),
    reportDiagnostic: overrides.reportDiagnostic ?? (() => undefined),
  };
}

describe("send-test-push startup diagnostics", () => {
  it("catches a missing secret through the production runtime initializer", async () => {
    const diagnostics: unknown[] = [];
    const handler = createSendTestPushRuntime(
      runtimeDependencies({
        getEnv: (name) =>
          name === "WEB_PUSH_SUBJECT" ? undefined : SECRETS[name],
        reportDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
      }),
    );

    const response = await handler(
      new Request("https://project.supabase.co/functions/v1/send-test-push"),
    );

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: {
        code: "PUSH_STARTUP_FAILED",
        stage: "WEB_PUSH_SUBJECT",
      },
    });
    expect(diagnostics).toEqual([
      {
        code: "PUSH_STARTUP_FAILED",
        stage: "WEB_PUSH_SUBJECT",
      },
    ]);
  });

  it("catches web-push configuration failure without exposing its message", async () => {
    const diagnostics: unknown[] = [];
    const handler = createSendTestPushRuntime(
      runtimeDependencies({
        configureWebPush: () => {
          throw new Error("private-key-value");
        },
        reportDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
      }),
    );

    const response = await handler(
      new Request("https://project.supabase.co/functions/v1/send-test-push"),
    );
    const body = await response.text();

    expect(response.status).toBe(500);
    expect(body).toContain('"stage":"WEB_PUSH_CONFIGURATION"');
    expect(body).not.toContain("private-key-value");
    expect(diagnostics).toEqual([
      {
        code: "PUSH_STARTUP_FAILED",
        stage: "WEB_PUSH_CONFIGURATION",
      },
    ]);
  });

  it("returns the missing secret name without exposing the thrown message", async () => {
    const diagnostics: unknown[] = [];
    const handler = createSafeSendTestPushHandler(
      () => {
        throw new SendTestPushStartupError("WEB_PUSH_SUBJECT");
      },
      (diagnostic) => diagnostics.push(diagnostic),
    );

    const response = await handler(
      new Request("https://project.supabase.co/functions/v1/send-test-push"),
    );

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: {
        code: "PUSH_STARTUP_FAILED",
        stage: "WEB_PUSH_SUBJECT",
      },
    });
    expect(diagnostics).toEqual([
      {
        code: "PUSH_STARTUP_FAILED",
        stage: "WEB_PUSH_SUBJECT",
      },
    ]);
  });

  it("does not expose an unexpected startup error message", async () => {
    const handler = createSafeSendTestPushHandler(
      () => {
        throw new Error("private-key-value");
      },
      () => undefined,
    );

    const response = await handler(
      new Request("https://project.supabase.co/functions/v1/send-test-push"),
    );
    const body = await response.text();

    expect(response.status).toBe(500);
    expect(body).toContain('"stage":"UNKNOWN"');
    expect(body).not.toContain("private-key-value");
  });

  it("preserves the normal OPTIONS response when startup fails", async () => {
    const handler = createSafeSendTestPushHandler(
      () => {
        throw new SendTestPushStartupError("WEB_PUSH_CONFIGURATION");
      },
      () => undefined,
    );

    const response = await handler(
      new Request(
        "https://project.supabase.co/functions/v1/send-test-push",
        { method: "OPTIONS" },
      ),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });
});
