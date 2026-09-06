import { defineConfig } from "@playwright/test";

const testPort = Number(process.env.MOBILE_RUNTIME_TEST_PORT ?? 4174);
const membershipPreviewPort = Number(process.env.MEMBERSHIP_PREVIEW_TEST_PORT ?? 4175);

export default defineConfig({
  testDir: "./tests",
  testMatch: "**/*.spec.ts",
  timeout: 20_000,
  use: {
    baseURL: `http://127.0.0.1:${testPort}`,
    viewport: { width: 1100, height: 1100 },
  },
  webServer: [
    {
      command: `npm run dev -- --config vite.runtime-tests.config.ts --host 127.0.0.1 --port ${testPort}`,
      url: `http://127.0.0.1:${testPort}/tests/runtime-fixture.html`,
      reuseExistingServer: process.env.MOBILE_RUNTIME_TEST_PORT == null,
    },
    {
      command: `node_modules/.bin/vite --config tests/membership-preview/vite.config.mjs --host 127.0.0.1 --port ${membershipPreviewPort}`,
      url: `http://127.0.0.1:${membershipPreviewPort}/qa/?inner=1&state=long`,
      reuseExistingServer: process.env.MEMBERSHIP_PREVIEW_TEST_PORT == null,
    },
  ],
});
