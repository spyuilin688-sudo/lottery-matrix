import { defineConfig } from "@playwright/test";

const membershipPreviewPort = Number(process.env.MEMBERSHIP_PREVIEW_TEST_PORT ?? 4175);

export default defineConfig({
  testDir: "./tests/membership-preview",
  testMatch: "responsive.spec.ts",
  timeout: 20_000,
  use: {
    baseURL: `http://127.0.0.1:${membershipPreviewPort}`,
    viewport: { width: 390, height: 900 },
  },
  webServer: {
    command: `node_modules/.bin/vite --config tests/membership-preview/vite.config.mjs --host 127.0.0.1 --port ${membershipPreviewPort}`,
    url: `http://127.0.0.1:${membershipPreviewPort}/qa/?inner=1&state=long`,
    reuseExistingServer: process.env.MEMBERSHIP_PREVIEW_TEST_PORT == null,
  },
});
