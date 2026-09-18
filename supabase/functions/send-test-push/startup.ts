import { CORS_HEADERS } from "./handler.ts";

export type SendTestPushHandler = (
  request: Request,
) => Response | Promise<Response>;

export type SendTestPushStartupStage =
  | "SUPABASE_URL"
  | "SUPABASE_SERVICE_ROLE_KEY"
  | "WEB_PUSH_PUBLIC_KEY"
  | "WEB_PUSH_PRIVATE_KEY"
  | "WEB_PUSH_SUBJECT"
  | "SUPABASE_CLIENT"
  | "WEB_PUSH_CONFIGURATION"
  | "UNKNOWN";

type RequiredSecretName = Extract<
  SendTestPushStartupStage,
  | "SUPABASE_URL"
  | "SUPABASE_SERVICE_ROLE_KEY"
  | "WEB_PUSH_PUBLIC_KEY"
  | "WEB_PUSH_PRIVATE_KEY"
  | "WEB_PUSH_SUBJECT"
>;

type SendTestPushRuntimeDependencies<SupabaseClient> = {
  getEnv(name: RequiredSecretName): string | undefined;
  createSupabaseClient(url: string, serviceRoleKey: string): SupabaseClient;
  configureWebPush(
    subject: string,
    publicKey: string,
    privateKey: string,
  ): void;
  createHandler(context: {
    serviceRoleKey: string;
    supabase: SupabaseClient;
  }): SendTestPushHandler;
  reportDiagnostic?: (diagnostic: unknown) => void;
};

export class SendTestPushStartupError extends Error {
  constructor(readonly stage: SendTestPushStartupStage) {
    super("send-test-push startup failed");
  }
}

function requiredSecret(
  getEnv: SendTestPushRuntimeDependencies<unknown>["getEnv"],
  name: RequiredSecretName,
) {
  const value = getEnv(name)?.trim() ?? "";
  if (!value) throw new SendTestPushStartupError(name);
  return value;
}

function startupStep<T>(
  stage: SendTestPushStartupStage,
  initialize: () => T,
) {
  try {
    return initialize();
  } catch {
    throw new SendTestPushStartupError(stage);
  }
}

export function createSafeSendTestPushHandler(
  initialize: () => SendTestPushHandler,
  reportDiagnostic: (diagnostic: unknown) => void = console.error,
): SendTestPushHandler {
  try {
    return initialize();
  } catch (cause) {
    const diagnostic = {
      code: "PUSH_STARTUP_FAILED",
      stage: cause instanceof SendTestPushStartupError
        ? cause.stage
        : "UNKNOWN",
    };
    reportDiagnostic(diagnostic);
    return (request) => {
      if (request.method === "OPTIONS") {
        return new Response("ok", { headers: CORS_HEADERS });
      }
      return new Response(JSON.stringify({ error: diagnostic }), {
        status: 500,
        headers: {
          ...CORS_HEADERS,
          "Cache-Control": "no-store",
          "Content-Type": "application/json",
        },
      });
    };
  }
}

export function createSendTestPushRuntime<SupabaseClient>(
  dependencies: SendTestPushRuntimeDependencies<SupabaseClient>,
) {
  return createSafeSendTestPushHandler(() => {
    const supabaseUrl = requiredSecret(dependencies.getEnv, "SUPABASE_URL");
    const serviceRoleKey = requiredSecret(
      dependencies.getEnv,
      "SUPABASE_SERVICE_ROLE_KEY",
    );
    const publicKey = requiredSecret(
      dependencies.getEnv,
      "WEB_PUSH_PUBLIC_KEY",
    );
    const privateKey = requiredSecret(
      dependencies.getEnv,
      "WEB_PUSH_PRIVATE_KEY",
    );
    const subject = requiredSecret(
      dependencies.getEnv,
      "WEB_PUSH_SUBJECT",
    );

    const supabase = startupStep(
      "SUPABASE_CLIENT",
      () => dependencies.createSupabaseClient(supabaseUrl, serviceRoleKey),
    );
    startupStep(
      "WEB_PUSH_CONFIGURATION",
      () => dependencies.configureWebPush(subject, publicKey, privateKey),
    );

    return dependencies.createHandler({ serviceRoleKey, supabase });
  }, dependencies.reportDiagnostic ?? console.error);
}
