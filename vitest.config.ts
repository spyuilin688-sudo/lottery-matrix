import { defineConfig, mergeConfig } from "vitest/config";
import viteConfig from "./vite.config";

export default mergeConfig(
  viteConfig,
  defineConfig({
    resolve: {
      alias: {
        "@appdeploy/client": new URL("./test/appdeploy-client.ts", import.meta.url).pathname,
        "@appdeploy/sdk": new URL("./test/appdeploy-sdk.ts", import.meta.url).pathname,
        "lucide-react": new URL("./test/lucide-react.tsx", import.meta.url).pathname,
      },
    },
    test: {
      setupFiles: ["./test/vitest-setup.ts"],
      exclude: ["backend/draw-schedule.test.ts"],
      include: [
        "src/**/*.test.ts",
        "src/**/*.test.tsx",
        "shared/**/*.test.ts",
        "backend/**/*.test.ts",
        "apps/admin/backend/**/*.test.ts",
        "apps/admin/src/**/*.test.tsx",
        "supabase/functions/line-logout/handler.test.ts",
      ],
    },
  }),
);
