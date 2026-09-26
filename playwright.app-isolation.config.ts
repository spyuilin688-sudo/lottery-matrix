import { defineConfig } from '@playwright/test';
import base from './playwright.config';
export default defineConfig({ ...base, use: { ...base.use, launchOptions: process.env.APP_TEST_CHROMIUM_PATH ? { executablePath: process.env.APP_TEST_CHROMIUM_PATH, args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'] } : undefined } });
