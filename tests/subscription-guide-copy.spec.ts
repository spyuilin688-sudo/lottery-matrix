import { expect, test } from '@playwright/test';
import { prepareReturningVisitor } from './helpers/product-runtime';

for (const width of [320, 390, 768]) {
  test(`訂閱與指南文案在 ${width}px 完整換行`, async ({ page }) => {
    await prepareReturningVisitor(page);
    await page.setViewportSize({ width, height: 844 });
    await page.route('https://*.supabase.co/**', route => {
      if (new URL(route.request().url()).pathname === '/rest/v1/rpc/matrix_permission_settings') {
        return route.fulfill({ json: { subscriptionPurchaseVisible: true, registeredMemberFreeAccess: false, revision: 1 } });
      }
      return route.fulfill({ status: 503, json: { error: 'copy_test_unavailable' } });
    });
    await page.goto('/');
    await page.getByTestId('bottom-navigation').getByRole('button', { name: '我的', exact: true }).click();
    await page.getByRole('button', { name: '訂閱方案／收費標準', exact: true }).click();
    const cards = page.locator('.plan-card');
    await expect(cards).toHaveCount(5);
    for (const card of await cards.all()) {
      for (const feature of ['Matrix 探索', 'Matrix 天衡', 'Matrix 天樞']) {
        await expect(card.getByText(`${feature} - 十三期、完整範圍`, { exact: true })).toHaveCount(1);
      }
    }
    // Offscreen carousel cards must also contain their fully wrapped lists.
    expect(await cards.evaluateAll(elements => elements.every(card => {
      const bounds = card.getBoundingClientRect();
      return [...card.querySelectorAll('li')].every(item => {
        const range = document.createRange();
        range.selectNodeContents(item);
        return [...range.getClientRects()].every(rect => rect.left >= bounds.left && rect.right <= bounds.right && rect.bottom <= bounds.bottom);
      });
    }))).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

    await page.getByTestId('bottom-navigation').getByRole('button', { name: '首頁', exact: true }).click();
    await page.getByRole('button', { name: 'Matrix 指南', exact: true }).click();
    const chapters = page.locator('[data-guide-group="canonical"] button');
    await expect(chapters).toHaveCount(19);
    for (const chapter of await chapters.all()) {
      await chapter.click();
      const preview = page.locator('.guide-preview');
      await expect(preview.locator('h2')).not.toBeEmpty();
      expect(await preview.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
  });
}
