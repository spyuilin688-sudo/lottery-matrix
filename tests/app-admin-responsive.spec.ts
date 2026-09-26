import { installAppTestFont } from './helpers/app-browser-font';
import { test, expect } from '@playwright/test';
for (const width of [320, 360, 390, 430]) {
  test(`App administration at ${width}px and 200% text`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.route('**/admin/api/**', route => {
      const path = new URL(route.request().url()).pathname;
      const data = path.endsWith('/bootstrap') ? { admin: { id: 'owner', name: 'Owner', role: '超級管理員', canManageApp: true } }
        : path.includes('/app/revenue') ? { transactionCount: 0, totalsByCurrency: [] }
          : { items: [{ id: '11111111-1111-4111-8111-111111111111', displayName: 'App 長名稱測試會員', status: 'active', entitlementRevision: 1, entitlementSource: 'free_launch' }], total: 1, page: 1, pageSize: 25 };
      return route.fulfill({ json: data });
    });
    await page.goto('/tests/app-admin-responsive-fixture.html?product=app');
    await expect(page.getByRole('cell').filter({ hasText: 'App 長名稱測試會員' }).first()).toBeVisible();
    await installAppTestFont(page);
    await page.addStyleTag({ content: '.app-admin-panel,.product-tabs,.app-admin-sections{font-size:200%}.app-admin-panel button,.app-admin-panel input,.product-tabs button,.app-admin-sections button{font-size:inherit}' });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.getByRole('button', { name: '停用', exact: true }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).not.toBeVisible();
    await page.getByRole('tab', { name: '收入', exact: true }).click();
    await expect(page.getByText('目前沒有 App 收入紀錄。')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: `test-results/app-admin-${width}.png`, fullPage: true });
  });
}
