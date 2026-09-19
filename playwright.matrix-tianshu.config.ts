import { defineConfig } from '@playwright/test';

const testPort = 4176;

export default defineConfig({
  testDir: './tests',
  testMatch: 'matrix-tianshu-layout.spec.ts',
  timeout: 30_000,
  outputDir: 'test-results/matrix-tianshu-layout',
  use: {
    baseURL: `http://127.0.0.1:${testPort}`,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `npx vite --host 127.0.0.1 --port ${testPort}`,
    url: `http://127.0.0.1:${testPort}/tests/matrix-tianshu-layout-fixture.html`,
    reuseExistingServer: true,
  },
});
