import { defineConfig } from "@playwright/test";

const testPort = 4175;

export default defineConfig({
  testDir: "./tests",
  testMatch: "matrix-explore-settings-responsive.spec.ts",
  timeout: 20_000,
  use: {
    baseURL: `http://127.0.0.1:${testPort}`,
  },
  webServer: {
    command: `npx vite --host 127.0.0.1 --port ${testPort}`,
    url: `http://127.0.0.1:${testPort}/tests/matrix-explore-settings-responsive-fixture.html`,
    reuseExistingServer: true,
  },
});
