import { expect, test } from '@playwright/test';

const colors = { primary: 'rgb(240, 213, 140)', secondary: 'rgb(214, 182, 111)', tertiary: 'rgb(138, 113, 63)' };
const draw = { period: '115217', drawDate: '2026-09-14', numbers: ['01', '09', '17', '28', '39'], sortedNumbers: ['01', '09', '17', '28', '39'], drawOrderNumbers: ['28', '01', '39', '09', '17'] };

test.beforeEach(async ({ page }) => {
  // No fixture identity, read or write is allowed to reach a live backend.
  await page.route(/^https?:\/\//, async route => {
    const url = new URL(route.request().url());
    if (url.hostname === '127.0.0.1' || url.hostname === 'localhost') return route.continue();
    const path = decodeURIComponent(url.pathname);
    if (path.endsWith('/matrix_permission_settings')) return route.fulfill({ json: { subscriptionPurchaseVisible: false, registeredMemberFreeAccess: true, revision: 1, updatedAt: '2026-09-15T00:00:00Z' } });
    if (path.endsWith('/member_profile')) return route.fulfill({ json: { lineUserId: 'frame-fixture', planName: 'Matrix Pro', planExpiresAt: null, isLifetime: true, exploreEntitlements: { canUseSeven: true, canUseThirteen: true, canUseFullRange: true } } });
    if (path.includes('/history-years/')) return route.fulfill({ json: { years: ['2026'] } });
    if (path.includes('/history/')) return route.fulfill({ json: { items: [draw], revision: 'frame-fixture' } });
    if (path.includes('/latest/')) return route.fulfill({ json: { item: draw } });
    if (path.includes('/cards/')) return route.fulfill({ json: { lottery: '今彩539', period: null, cards: {} } });
    if (path.includes('/rest/v1/rpc/')) return route.fulfill({ json: {} });
    return route.fulfill({ status: 503, json: { error: 'isolated_visual_fixture' } });
  });
});

const pages = ['explore', 'tianheng', 'tianyan', 'tiangong', 'tongxing', 'reference', 'history', 'calculator', 'matrix-card', 'notifications', 'profile', 'guide', 'activation-code', 'subscription-management', 'about-matrix', 'service-info', 'version-info', 'privacy-policy', 'member-terms', 'disclaimer', 'notebook'] as const;
const cases = [...pages.map(screen => ({ screen, width: 390 })), ...(['explore', 'reference', 'notifications'] as const).flatMap(screen => [320, 430].map(width => ({ screen, width })))];

for (const { screen, width } of cases) {
  test(`production ${screen} uses shared thin frame hierarchy at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto(`/tests/pwa-frame-fixture.html?page=${screen}`);
    const title = page.locator('.product-header__settings-card, .product-header > .product-header__frame');
    await expect(title).toBeVisible();
    await expect(title).toHaveCSS('border-top-width', '1px');
    await expect(title).toHaveCSS('border-top-color', colors.primary);
    await expect(title).toHaveCSS('border-radius', '8px');
    await expect.poll(() => page.evaluate(() => document.fonts.status)).toBe('loaded');
    const nested = page.locator('.product-header__settings-card > .product-header__frame');
    if (await nested.count()) await expect(nested).toHaveCSS('border-top-width', '0px');

    const panels = page.locator('.panel:not(.membership-card):not(.tongxing-results):not(.tool-settings-panel)');
    for (const panel of await panels.all()) {
      if (!(await panel.isVisible())) continue;
      const border = await panel.evaluate(element => getComputedStyle(element).borderTopWidth);
      if (border === '0px') continue; // Intentional layout wrappers do not receive a second outline.
      await expect(panel).toHaveCSS('border-top-width', '1px');
      await expect(panel).toHaveCSS('border-top-color', colors.secondary);
      await expect(panel).toHaveCSS('border-radius', '8px');
      await expect(panel).toHaveCSS('box-shadow', 'none');
    }
    if (screen === 'calculator') {
      await expect(page.locator('.mode-tabs button[data-selected="true"]')).toHaveCSS('color', colors.secondary);
      await expect(page.locator('.mode-tabs button[data-selected="true"]')).toHaveCSS('box-shadow', 'none');
    }
    if (screen === 'notifications') {
      await expect(page.locator('.notification-bulk-disable')).toHaveCSS('background-color', 'rgb(2, 7, 12)');
      await expect(page.locator('.notification-bulk-disable')).toHaveCSS('border-top-color', colors.tertiary);
    }
    const controls = page.locator('.segmented button, .segmented-static, .hit-options button, .native-select, .matrix-card-order button');
    for (const control of await controls.all()) {
      if (!(await control.isVisible())) continue;
      await expect(control).toHaveCSS('border-top-width', '1px');
      const selected = await control.evaluate(element => element.getAttribute('data-selected') === 'true' || element.classList.contains('is-selected'));
      await expect(control).toHaveCSS('border-top-color', selected ? colors.secondary : colors.tertiary);
      await expect(control).toHaveCSS('box-shadow', 'none');
    }
    const underlineLotteryTabs = ['explore', 'tianheng', 'tianyan', 'tiangong', 'matrix-card'].includes(screen);
    for (const tab of await page.locator('.lottery-tabs button').all()) {
      if (!(await tab.isVisible())) continue;
      await expect(tab).toHaveCSS('border-top-width', underlineLotteryTabs ? '0px' : '1px');
      const selected = await tab.getAttribute('data-selected') === 'true';
      if (underlineLotteryTabs) {
        await expect(tab.locator('span')).toHaveCSS('border-bottom-color', selected ? colors.secondary : 'rgba(0, 0, 0, 0)');
      } else {
        await expect(tab).toHaveCSS('border-top-color', selected ? colors.secondary : colors.tertiary);
      }
      await expect(tab).toHaveCSS('box-shadow', 'none');
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`${screen}-${width}.png`), animations: 'disabled' });
  });
}

test('real advanced native select has a frame and selected options change without glow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/tests/pwa-frame-fixture.html?page=explore');
  const advanced = page.locator('.advanced-panel .native-select');
  if (!(await advanced.isVisible())) await page.locator('.advanced-row').click();
  await expect(advanced).toHaveCSS('border-top-width', '1px');
  await expect(advanced).toHaveCSS('border-top-color', colors.tertiary);
  const seven = page.locator('.segmented button').filter({ hasText: /^七期/ });
  await seven.click();
  await expect(seven).toHaveAttribute('data-selected', 'true');
  await expect(seven).toHaveCSS('border-top-color', colors.secondary);
  await expect(seven).toHaveCSS('color', colors.secondary);
  await expect(seven).toHaveCSS('box-shadow', 'none');
  await expect(page.locator('.primary-action')).toHaveCSS('border-top-color', colors.primary);
  await expect(page.locator('.primary-action')).toHaveCSS('box-shadow', 'none');
});

for (const width of [320, 390, 430]) {
  test(`expanded result validation keeps thin outer frames at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/explore-result-preview');
    await expect(page.locator('.result-panel')).toHaveCSS('border-top-color', colors.secondary);
    await expect(page.locator('.result-panel')).toHaveCSS('border-top-width', '1px');
    await page.locator('.explore-result-road-toggle').first().click();
    const summary = page.locator('.explore-validation-summary-card').first();
    await expect(summary).toBeVisible();
    await expect(summary).toHaveCSS('border-top-color', colors.secondary);
    await expect(summary).toHaveCSS('border-top-width', '1px');
    await expect(summary).toHaveCSS('border-radius', '8px');
    await expect(page.locator('.explore-validation-card').first()).toHaveCSS('box-shadow', 'none');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`validation-${width}.png`), animations: 'disabled' });
  });
}
