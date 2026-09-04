import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: [
      "supabase/functions/_shared/web-push-delivery.test.ts",
      "supabase/functions/notification-dispatch/handler.test.ts",
      "supabase/functions/notification-ingest/handler.test.ts",
      "supabase/functions/send-test-push/**/*.test.ts",
    ],
    setupFiles: ["./test/edge-functions-setup.ts"],
  },
});
