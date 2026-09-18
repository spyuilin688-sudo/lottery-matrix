import { describe, expect, it, vi } from "vitest";
import { createSendTestPushRuntime } from "./startup.ts";

const REQUIRED_SECRETS = {
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
  WEB_PUSH_PUBLIC_KEY: "public-key",
  WEB_PUSH_PRIVATE_KEY: "private-key",
  WEB_PUSH_SUBJECT: "mailto:ops@example.com",
} as const;

type SecretName = keyof typeof REQUIRED_SECRETS;

function dependencies(
  values: Partial<Record<SecretName, string>> = REQUIRED_SECRETS,
) {
  return {
    getEnv: (name: SecretName) => values[name],
    createSupabaseClient: vi.fn(() => ({ client: true })),
    configureWebPush: vi.fn(),
    createHandler: vi.fn(() => () => new Response("ready", { status: 202 })),
    reportDiagnostic: vi.fn(),
  };
}

describe("send-test-push startup", () => {
  it.each(Object.keys(REQUIRED_SECRETS) as SecretName[])(
    "returns a stable response when %s is missing",
    async (missingSecret) => {
      const values: Partial<Record<SecretName, string>> = {
        ...REQUIRED_SECRETS,
      };
      delete values[missingSecret];
      const runtimeDependencies = dependencies(values);

      const handler = createSendTestPushRuntime(runtimeDependencies);
      const response = await handler(new Request("https://example.test", {
        method: "POST",
      }));

      expect(response.status).toBe(500);
      await expect(response.json()).resolves.toEqual({
        error: { code: "PUSH_STARTUP_FAILED", stage: missingSecret },
      });
      expect(runtimeDependencies.reportDiagnostic).toHaveBeenCalledWith({
        code: "PUSH_STARTUP_FAILED",
        stage: missingSecret,
      });
    },
  );

  it("keeps CORS preflight available after startup failure", async () => {
    const handler = createSendTestPushRuntime(dependencies({}));
    const response = await handler(new Request("https://example.test", {
      method: "OPTIONS",
    }));

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("ok");
    expect(response.headers.get("Access-Control-Allow-Methods")).toBe(
      "POST, OPTIONS",
    );
  });

  it("initializes dependencies once and delegates to the request handler", async () => {
    const runtimeDependencies = dependencies();
    const handler = createSendTestPushRuntime(runtimeDependencies);
    const response = await handler(new Request("https://example.test", {
      method: "POST",
    }));

    expect(response.status).toBe(202);
    expect(runtimeDependencies.createSupabaseClient).toHaveBeenCalledWith(
      REQUIRED_SECRETS.SUPABASE_URL,
      REQUIRED_SECRETS.SUPABASE_SERVICE_ROLE_KEY,
    );
    expect(runtimeDependencies.configureWebPush).toHaveBeenCalledWith(
      REQUIRED_SECRETS.WEB_PUSH_SUBJECT,
      REQUIRED_SECRETS.WEB_PUSH_PUBLIC_KEY,
      REQUIRED_SECRETS.WEB_PUSH_PRIVATE_KEY,
    );
    expect(runtimeDependencies.createHandler).toHaveBeenCalledTimes(1);
  });

  it("reports initialization stages without leaking their causes", async () => {
    const cases = [
      {
        stage: "SUPABASE_CLIENT",
        configure: (value: ReturnType<typeof dependencies>) =>
          value.createSupabaseClient.mockImplementation(() => {
            throw new Error("sensitive client failure");
          }),
      },
      {
        stage: "WEB_PUSH_CONFIGURATION",
        configure: (value: ReturnType<typeof dependencies>) =>
          value.configureWebPush.mockImplementation(() => {
            throw new Error("sensitive VAPID failure");
          }),
      },
    ] as const;

    for (const { stage, configure } of cases) {
      const runtimeDependencies = dependencies();
      configure(runtimeDependencies);
      const handler = createSendTestPushRuntime(runtimeDependencies);
      const response = await handler(new Request("https://example.test", {
        method: "POST",
      }));

      expect(response.status).toBe(500);
      await expect(response.json()).resolves.toEqual({
        error: { code: "PUSH_STARTUP_FAILED", stage },
      });
    }
  });
});
