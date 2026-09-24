import { defineConfig, mergeConfig } from "vitest/config";
import viteConfig from "./vite.config";

export default mergeConfig(
  viteConfig,
  defineConfig({
    resolve: {
      alias: {
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
      ],
    },
  }),
);
