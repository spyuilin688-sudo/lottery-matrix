import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem('matrix-manual-transfer-plan', 'month'));
  // Fixture identities and payment requests must never reach a live backend.
  await page.route(/^https?:\/\//, route => {
    const url = new URL(route.request().url());
    if (url.hostname === '127.0.0.1' || url.hostname === 'localhost') return route.continue();
    if (url.pathname.endsWith('/matrix_permission_settings')) return route.fulfill({ json: {
      subscriptionPurchaseVisible: true, registeredMemberFreeAccess: false,
      revision: 1, updatedAt: '2026-09-23T00:00:00Z',
    } });
    if (url.pathname.endsWith('/member_profile')) return route.fulfill({ json: {
      memberId: 'transfer-fixture', lineUserId: 'transfer-fixture',
      planName: null, planExpiresAt: null, isLifetime: false,
    } });
    if (url.pathname.endsWith('/member_pending_transfer_request')) {
      return route.fulfill({ contentType: 'application/json', body: 'null' });
    }
    return route.fulfill({ status: 503, json: { error: 'isolated_transfer_fixture' } });
  });
});

for (const width of [320, 390, 430]) {
  test(`receiving details and transfer form fit at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/tests/pwa-frame-fixture.html?page=manual-transfer');
    const bank = page.getByRole('region', { name: '轉帳資料' });
    await expect(bank).toBeVisible();
    for (const [label, value] of [
      ['收款銀行', '連線銀行'], ['銀行代碼', '824'],
      ['收款帳號', '111023004501'], ['戶名', '黎小姐'],
    ]) {
      const row = bank.locator('dl > div').filter({ has: page.locator('dt', { hasText: label }) });
      await expect(row.locator('dd')).toHaveText(value);
    }
    await expect(page.getByText('申請狀態載入中')).toBeHidden();
    await expect.poll(() => page.evaluate(() => document.fonts.status)).toBe('loaded');
    expect(await bank.evaluate(element => {
      const bounds = element.getBoundingClientRect();
      return [...element.querySelectorAll('dt, dd')].every(field => {
        const range = document.createRange();
        range.selectNodeContents(field);
        return [...range.getClientRects()].every(rect => rect.left >= bounds.left && rect.right <= bounds.right);
      });
    })).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const lastFive = page.getByLabel('帳號末五碼');
    await expect(lastFive).toBeEnabled();
    await expect(page.getByRole('button', { name: '提交', exact: true })).toBeDisabled();
    await page.screenshot({ path: testInfo.outputPath(`manual-transfer-${width}.png`), animations: 'disabled' });
  });
}

test('payer account survives a failed submission and a keyboard retry becomes pending', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  let submissions = 0;
  await page.route('**/rest/v1/rpc/member_transfer_request_submit', route => {
    expect(route.request().postDataJSON()).toEqual({ p_plan_code: 'month', p_account_last_five: '12345' });
    submissions += 1;
    return submissions === 1
      ? route.fulfill({ status: 503, json: { message: 'fixture_retry' } })
      : route.fulfill({ json: {
        id: 'fixture-transfer', planName: '月費方案', amount: 2880,
        accountLastFive: '12345', submittedAt: '2026-09-23T00:00:00Z', status: 'pending',
      } });
  });
  await page.goto('/tests/pwa-frame-fixture.html?page=manual-transfer');
  const lastFive = page.getByLabel('帳號末五碼');
  const submit = page.getByRole('button', { name: '提交', exact: true });
  await expect(lastFive).toBeEnabled();
  await lastFive.fill('12345');
  await expect(submit).toBeEnabled();
  await lastFive.press('Tab');
  await expect(submit).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('alert')).toContainText('提交失敗');
  await expect(lastFive).toHaveValue('12345');
  await expect(submit).toBeEnabled();
  await submit.press('Enter');
  await expect(page.getByText('待確認', { exact: true })).toBeVisible();
  await expect(lastFive).toBeDisabled();
  await expect(submit).toBeDisabled();
  expect(submissions).toBe(2);
});
