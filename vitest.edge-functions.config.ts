import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: [
      "supabase/functions/admin-transfer-push/**/*.test.ts",
      "supabase/functions/admin-security-push/**/*.test.ts",
      "supabase/functions/_shared/**/*.test.ts",
      "supabase/functions/line-logout/**/*.test.ts",
      "supabase/functions/notification-dispatch/**/*.test.ts",
      "supabase/functions/notification-ingest/**/*.test.ts",
      "supabase/functions/notification-pilio/**/*.test.ts",
      "supabase/functions/send-test-push/**/*.test.ts",
    ],
    setupFiles: ["./test/edge-functions-setup.ts"],
  },
});
