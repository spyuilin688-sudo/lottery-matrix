import { installAppTestFont } from './helpers/app-browser-font';
import { test, expect } from '@playwright/test';
for (const width of [320, 360, 390, 430]) {
  test(`public App privacy at ${width}px, no PWA enrollment`, async ({ page }) => {
    const requests: string[] = [];
    await page.setViewportSize({ width, height: 900 });
    await page.route('**/*.supabase.co/**', route => { requests.push(route.request().url()); return route.abort(); });
    await page.goto('/app-info/privacy');
    await expect(page.getByRole('heading', { name: '樂彩 Matrix App 隱私權政策' })).toBeVisible();
    await installAppTestFont(page);
    await page.addStyleTag({ content: '.app-info-page{font-size:200%}' });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(page.getByRole('link', { name: '申請刪除 App 帳號' })).toBeVisible();
    expect(requests).toEqual([]);
    await page.screenshot({ path: `test-results/app-privacy-${width}.png`, fullPage: true });
  });
}
