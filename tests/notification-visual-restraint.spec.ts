import { expect, test } from '@playwright/test';

const lotteries = ['今彩539', '天天樂', '六合彩', '大樂透'];
const stored = {
  settings: { bet: true, result: true, status: true, card: true, collision: false, expiry: true, system: true },
  selectedOptions: { result: lotteries, status: lotteries, card: lotteries, expiry: ['提前1日', '提前3日', '提前7日'], system: ['維護', '更新'] },
  betTimes: Object.fromEntries(lotteries.map(lottery => [lottery, ['', '']])),
  statusOptions: Object.fromEntries(lotteries.map(lottery => [lottery, ['啟動', '聚合', '共振', '臨界']])),
  collisionOptions: Object.fromEntries(lotteries.map(lottery => [lottery, ['獨碰二星', '獨碰三星']])),
};

for (const width of [320, 360, 390, 412, 430]) {
  test(`notification visual restraint and disclosures at ${width}px`, async ({ page }, testInfo) => {
    const writes: unknown[] = [];
    await page.setViewportSize({ width, height: 844 });
    // Use the real router and controls; no fixture request may reach a live backend.
    await page.route(/^https?:\/\//, async route => {
      const url = new URL(route.request().url());
      if (url.pathname.endsWith('/matrix_permission_settings')) return route.fulfill({ json: { subscriptionPurchaseVisible: false, registeredMemberFreeAccess: true, revision: 1 } });
      if (url.pathname.endsWith('/member_notification_settings_get')) return route.fulfill({ json: stored });
      if (url.pathname.endsWith('/member_notification_settings_save')) {
        const value = route.request().postDataJSON().p_settings;
        writes.push(value);
        return route.fulfill({ json: value });
      }
      if (['localhost', '127.0.0.1'].includes(url.hostname)) return route.continue();
      return route.fulfill({ status: 503, json: { error: 'isolated_notification_visual_test' } });
    });
    await page.goto('/tests/pwa-frame-fixture.html?page=notifications');
    const screen = page.locator('.notifications-screen-v2');
    const row = (key: string) => screen.locator(`[data-notification-key="${key}"]`);
    await expect(row('system').locator('.toggle')).toBeEnabled();
    await expect(screen.locator('.product-header__frame')).toHaveCSS('height', '68px');
    for (const button of await screen.locator('.notification-bulk-actions button').all()) {
      await expect(button).toHaveCSS('height', '29px');
      await expect(button).toHaveCSS('background-image', 'none');
      await expect(button).toHaveCSS('box-shadow', 'none');
      expect(await button.evaluate(el => getComputedStyle(el, '::before').content)).toBe('none');
    }
    await expect(row('collision').locator('.toggle')).toBeDisabled();
    await expect(row('collision').locator('.toggle')).toHaveAttribute('data-checked', 'false');
    await expect(row('collision').locator('.notification-settings-toggle')).toBeDisabled();
    await expect(row('collision').locator('.notification-icon img')).toHaveCSS('filter', 'brightness(0.82) saturate(0.66)');
    await expect(row('bet').locator('.notification-icon img')).toHaveCSS('filter', 'brightness(0.88) saturate(0.74)');

    for (const key of ['collapsed', 'bet', 'status', 'card', 'expiry', 'system']) {
      if (key !== 'collapsed') {
        const trigger = row(key).locator('.notification-settings-toggle');
        await trigger.click();
        await expect(trigger).toHaveAttribute('aria-expanded', 'true');
        await expect(trigger).toHaveCSS('color', 'rgb(214, 182, 111)');
        const panel = row(key).locator('.notification-inline-settings');
        await expect(panel).toHaveCSS('opacity', '1');
        await expect(panel).toHaveCSS('transform', 'none');
        if (['card', 'expiry', 'system'].includes(key)) {
          await expect(row(key).locator('.notification-choice').first()).toHaveCSS('padding-top', '6px');
        }
      }
      const geometry = await screen.evaluate(root => {
        const rect = (el: Element) => el.getBoundingClientRect();
        const outside: string[] = [];
        for (const el of root.querySelectorAll('.notification-heading, .notification-icon, .notification-title, .notification-actions, .notification-grid-row, .notification-choice, .notification-time-select')) {
          if (el.closest('[inert]')) continue;
          const box = rect(el);
          if (box.left < -0.5 || box.right > innerWidth + 0.5 || el.scrollWidth > el.clientWidth + 1) outside.push(`${el.className}: ${el.textContent} width=${box.width} client=${el.clientWidth} scroll=${el.scrollWidth}`);
        }
        const rows = [...root.querySelectorAll('.notification-heading')].map(el => {
          const icon = rect(el.querySelector('.notification-icon')!);
          const title = rect(el.querySelector('.notification-title')!);
          const actions = rect(el.querySelector('.notification-actions')!);
          return icon.right <= title.left && title.right <= actions.left;
        });
        return { outside, rows, overflow: document.documentElement.scrollWidth > innerWidth };
      });
      await page.screenshot({ path: testInfo.outputPath(`${key}-${width}.png`) });
      expect(geometry).toEqual({ outside: [], rows: Array(7).fill(true), overflow: false });
      for (const icon of await screen.locator('.notification-icon img').all()) {
        await expect(icon).toHaveCSS('width', '34px');
        await expect(icon).toHaveCSS('height', '34px');
        expect(await icon.evaluate(el => (el as HTMLImageElement).naturalWidth > 0)).toBe(true);
      }
      for (const toggle of await screen.locator('.notification-actions > .toggle').all()) {
        await expect(toggle).toHaveCSS('width', '38px');
        await expect(toggle).toHaveCSS('height', '44px');
        expect(await toggle.evaluate(el => [getComputedStyle(el, '::before').width, getComputedStyle(el, '::before').height])).toEqual(['38px', '18px']);
      }
      for (const setting of await screen.locator('.notification-actions > .notification-settings-toggle').all()) {
        await expect(setting).toHaveCSS('width', '56px');
        await expect(setting).toHaveCSS('height', '44px');
        expect(await setting.evaluate(el => getComputedStyle(el, '::before').height)).toBe('20px');
      }
      if (key !== 'collapsed') {
        await row(key).locator('.notification-settings-toggle').click();
        await expect(row(key).locator('.notification-inline-settings')).toHaveCSS('visibility', 'hidden');
        await expect(row(key).locator('.notification-inline-settings')).toHaveCSS('transform', 'none');
      }
    }
    expect(writes).toHaveLength(0); // Opening/closing settings must not cause saves.
    await row('bet').locator('.notification-settings-toggle').click();
    const time = page.getByLabel('今彩539時間1', { exact: true });
    await time.selectOption('18:30');
    await expect(time).toHaveValue('18:30');
    await time.press('Tab');
    const timeFrame = row('bet').locator('.notification-time-select').first();
    await expect(timeFrame).toHaveCSS('border-top-color', 'rgb(138, 113, 63)');
    await time.focus();
    await expect(timeFrame).toHaveCSS('border-top-color', 'rgb(240, 213, 140)');
    await expect(timeFrame).toHaveCSS('height', '21px');
    await expect.poll(() => writes.length).toBe(1);
    await row('status').locator('.notification-settings-toggle').click();
    await expect(row('status').locator('.notification-grid-status-row')).toHaveCount(4);
    await expect(row('status').locator('input[type="checkbox"]')).toHaveCount(16);
    const choice = row('status').locator('.notification-choice').first();
    await expect(choice).toHaveCSS('border-top-color', 'rgb(138, 113, 63)');
    await expect(choice).toHaveCSS('color', 'rgb(196, 145, 69)');
    await expect(choice.locator('input')).toHaveCSS('width', '12px');
    await choice.locator('input').uncheck();
    await expect(choice).toHaveCSS('border-top-color', 'color(srgb 0.839216 0.713725 0.435294 / 0.38)');
    await expect.poll(() => writes.length).toBe(2);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await row('system').locator('.notification-settings-toggle').click();
    await expect(row('system').locator('.notification-inline-settings')).toHaveCSS('transition-property', 'opacity');
    await row('system').scrollIntoViewIfNeeded();
    const bottom = await page.evaluate(() => {
      const nav = document.querySelector('[data-testid="bottom-navigation"]')!.getBoundingClientRect();
      const last = document.querySelector('[data-notification-key="system"]')!.getBoundingClientRect();
      return { clear: last.bottom <= nav.top, navHeight: nav.height };
    });
    expect(bottom.clear).toBe(true);
    expect(bottom.navHeight).toBeGreaterThanOrEqual(70);
    // Simulate an Android bottom inset through the existing layout tokens.
    // This exercises clearance, without changing production viewport or navigation rules.
    await page.addStyleTag({ content: ':root { --layout-bottom-nav-clearance: calc(var(--bottom-navigation-height) + 34px); } .bottom-navigation { --bottom-nav-safe-area: 34px; }' });
    await row('system').scrollIntoViewIfNeeded();
    const inset = await page.evaluate(() => {
      const nav = document.querySelector('[data-testid="bottom-navigation"]')!.getBoundingClientRect();
      const last = document.querySelector('[data-notification-key="system"]')!.getBoundingClientRect();
      return { clear: last.bottom <= nav.top, navHeight: nav.height };
    });
    expect(inset.clear).toBe(true);
    expect(inset.navHeight).toBe(bottom.navHeight + 34);
  });
}
