import { defineConfig, mergeConfig } from "vitest/config";
import viteConfig from "./vite.config";

export default mergeConfig(
  viteConfig,
  defineConfig({
    resolve: {
      alias: {
        "@appdeploy/sdk": new URL("./test/appdeploy-sdk.ts", import.meta.url).pathname,
      },
    },
    test: {
      include: [
        "src/**/*.test.ts",
        "src/**/*.test.tsx",
        "shared/**/*.test.ts",
        "backend/**/*.test.ts",
        "apps/admin/backend/**/*.test.ts",
        "apps/admin/src/**/*.test.tsx",
      ],
    },
  }),
);
