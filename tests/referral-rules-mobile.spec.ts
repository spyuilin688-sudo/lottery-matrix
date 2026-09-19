import { expect, test } from '@playwright/test';
import { prepareReturningVisitor } from './helpers/product-runtime';

for (const width of [320, 360, 390, 430, 768]) {
  test(`推薦規則在 ${width}px 完整換行並保留收合操作`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 844 });
    await prepareReturningVisitor(page);
    await page.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.hostname === '127.0.0.1' || url.hostname === 'localhost') return route.continue();
      if (url.pathname.endsWith('/matrix_permission_settings')) return route.fulfill({ json: {
        subscriptionPurchaseVisible: true, registeredMemberFreeAccess: false,
        revision: 1, updatedAt: '2026-09-20T00:00:00Z',
      } });
      // This presentation check never sends member or lottery requests to production.
      return route.fulfill({ status: 503, json: { error: 'preview-only' } });
    });
    await page.goto('/');
    await page.getByTestId('bottom-navigation').getByRole('button', { name: '我的', exact: true }).click();
    await page.getByRole('button', { name: '我的推薦碼/啟動碼', exact: true }).click();
    for (const name of ['推薦成功認定', '推薦成功獎勵', '推薦獎勵補充規則']) {
      const button = page.getByRole('button', { name, exact: true });
      await expect(button).toHaveAttribute('aria-expanded', 'false');
      await expect.poll(() => button.locator('svg').evaluate(e => getComputedStyle(e).rotate)).toBe('90deg');
      await button.focus();
      await page.keyboard.press('Enter');
      await expect(button).toHaveAttribute('aria-expanded', 'true');
      await expect.poll(() => button.locator('svg').evaluate(e => getComputedStyle(e).rotate)).toBe('-90deg');
    }
    const panel = page.locator('.referral-code-section');
    await expect(panel.locator('.referral-rewards dt')).toHaveText([
      '推薦成功滿 10 人', '推薦成功滿 15 人', '推薦成功滿 30 人', '推薦成功滿 50 人',
    ]);
    await expect(panel.locator('.referral-rewards-note')).toHaveText('永久開放仍須維持對應的推薦成功人數門檻。');
    expect(await panel.evaluate(root => {
      const box = root.getBoundingClientRect();
      return [...root.querySelectorAll<HTMLElement>('.referral-rule-content li, .referral-rewards dt, .referral-rewards dd, .referral-rewards-note')]
        .filter(e => e.scrollWidth > e.clientWidth + 1 || e.getBoundingClientRect().left < box.left || e.getBoundingClientRect().right > box.right + 1)
        .map(e => e.textContent);
    })).toEqual([]);
    expect(await panel.evaluate(e => e.scrollWidth <= e.clientWidth + 1)).toBe(true);
    const activation = page.getByRole('button', { name: '啟動碼使用說明', exact: true });
    await activation.click();
    await expect.poll(() => activation.locator('svg').evaluate(e => getComputedStyle(e).rotate)).toBe('90deg');
    await expect(page.getByText('每組啟動碼只能成功使用一次。')).toBeVisible();
    const reward = page.getByRole('button', { name: '推薦成功獎勵', exact: true });
    await reward.focus();
    await page.keyboard.press('Space');
    await expect(reward).toHaveAttribute('aria-expanded', 'false');
    await expect(panel.locator('.referral-rewards')).toHaveCount(0);
    await reward.click();
    if (width === 390) {
      await panel.locator('.referral-rule-card').first().scrollIntoViewIfNeeded();
      await testInfo.attach('referral-mobile-390', { body: await page.screenshot(), contentType: 'image/png' });
    }
  });
}
