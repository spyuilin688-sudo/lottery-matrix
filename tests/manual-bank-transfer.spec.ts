import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem('matrix-manual-transfer-plan', JSON.stringify({
    plan: 'month', memberId: '00000000-0000-4000-8000-000000000915',
  })));
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
    await expect(page.getByRole('button', { name: /^(提交|重新確認申請|確認中)$/ })).toBeDisabled();
    await page.screenshot({ path: testInfo.outputPath(`manual-transfer-${width}.png`), animations: 'disabled' });
  });
}

test('payer account survives a failed submission and a keyboard retry becomes pending', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  let submissions = 0;
  let requestId: string | undefined;
  await page.route('**/rest/v1/rpc/member_transfer_request_submit', route => {
    const payload = route.request().postDataJSON();
    expect(payload).toEqual({ p_plan_code: 'month', p_account_last_five: '12345', p_request_id: expect.any(String) });
    expect(payload.p_request_id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    if (requestId) expect(payload.p_request_id).toBe(requestId);
    requestId = payload.p_request_id;
    submissions += 1;
    return submissions === 1
      ? route.fulfill({ status: 503, json: { message: 'fixture_retry' } })
      : route.fulfill({ json: {
        id: requestId, planName: '月費方案', amount: 2880,
        accountLastFive: '12345', submittedAt: '2026-09-23T00:00:00Z', status: 'pending',
      } });
  });
  await page.goto('/tests/pwa-frame-fixture.html?page=manual-transfer');
  const lastFive = page.getByLabel('帳號末五碼');
  const submit = page.getByRole('button', { name: /^(提交|重新確認申請|確認中)$/ });
  await expect(lastFive).toBeEnabled();
  await lastFive.fill('12345');
  await expect(submit).toBeEnabled();
  await lastFive.press('Tab');
  await expect(submit).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('alert')).toContainText('尚未確認提交結果');
  await expect(lastFive).toHaveValue('12345');
  await expect(submit).toBeEnabled();
  await submit.press('Enter');
  await expect(page.getByText('待確認', { exact: true })).toBeVisible();
  await expect(lastFive).toBeDisabled();
  await expect(submit).toBeDisabled();
  expect(submissions).toBe(2);
});

test('unknown transfer status blocks submission until an explicit successful reload', async ({ page }) => {
  let reads = 0;
  let submissions = 0;
  await page.route('**/rest/v1/rpc/member_pending_transfer_request', route => {
    reads += 1;
    return reads === 1
      ? route.fulfill({ status: 503, json: { message: 'fixture_unavailable' } })
      : route.fulfill({ contentType: 'application/json', body: 'null' });
  });
  await page.route('**/rest/v1/rpc/member_transfer_request_submit', route => {
    submissions += 1;
    return route.fulfill({ status: 503, json: { message: 'unexpected_submit' } });
  });
  await page.goto('/tests/pwa-frame-fixture.html?page=manual-transfer');
  await page.getByLabel('帳號末五碼').fill('12345');
  await expect(page.getByRole('alert')).toContainText('無法讀取轉帳申請');
  const submit = page.getByRole('button', { name: /^(提交|重新確認申請|確認中)$/ });
  await expect(submit).toBeDisabled();
  const reload = page.getByRole('button', { name: '重新載入申請狀態' });
  await reload.focus();
  await reload.press('Enter');
  await expect(submit).toBeEnabled();
  expect(reads).toBe(2);
  expect(submissions).toBe(0);
});

test('lost submission response is reconciled without submitting the transfer twice', async ({ page }) => {
  let submissions = 0;
  let requestId: string | undefined;
  await page.route('**/rest/v1/rpc/member_transfer_request_submit', route => {
    submissions += 1;
    requestId = route.request().postDataJSON().p_request_id;
    return route.fulfill({ status: 503, json: { message: 'fixture_response_lost' } });
  });
  await page.route('**/rest/v1/rpc/member_pending_transfer_request', route => {
    return submissions === 0
      ? route.fulfill({ contentType: 'application/json', body: 'null' })
      : route.fulfill({ json: {
        id: requestId, planName: '月費方案', amount: 2880,
        accountLastFive: '12345', submittedAt: '2026-09-23T00:00:00Z', status: 'pending',
      } });
  });
  await page.goto('/tests/pwa-frame-fixture.html?page=manual-transfer');
  await page.getByLabel('帳號末五碼').fill('12345');
  const submit = page.getByRole('button', { name: /^(提交|重新確認申請|確認中)$/ });
  await expect(submit).toBeEnabled();
  await submit.click();
  await expect(page.getByText('待確認', { exact: true })).toBeVisible();
  await expect(submit).toBeDisabled();
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect(submissions).toBe(1);
});

test('a lost response can replay an already reviewed request after reload with the same ID', async ({ page }) => {
  let requestId: string | undefined;
  let submissions = 0;
  await page.route('**/rest/v1/rpc/member_transfer_request_submit', route => {
    const payload = route.request().postDataJSON();
    submissions += 1;
    if (submissions === 1) {
      requestId = payload.p_request_id;
      return route.fulfill({ status: 503, json: { message: 'fixture_response_lost' } });
    }
    expect(payload).toEqual({ p_plan_code: 'month', p_account_last_five: '12345', p_request_id: requestId });
    return route.fulfill({ json: {
      id: requestId, planName: '月費方案', amount: 2880,
      accountLastFive: '12345', submittedAt: '2026-09-23T00:00:00Z', status: 'confirmed',
    } });
  });
  await page.goto('/tests/pwa-frame-fixture.html?page=manual-transfer');
  await page.getByLabel('帳號末五碼').fill('12345');
  const submit = page.getByRole('button', { name: /^(提交|重新確認申請|確認中)$/ });
  await expect(submit).toBeEnabled();
  await submit.click();
  await expect(page.getByRole('alert')).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('帳號末五碼')).toHaveValue('12345');
  await expect(page.getByLabel('帳號末五碼')).toBeDisabled();
  await expect(submit).toBeEnabled();
  await submit.click();
  await expect(page.locator('.manual-transfer-pending strong')).toHaveText('已確認');
  await expect(page.getByText('已有待確認申請')).toHaveCount(0);
  await expect(submit).toBeDisabled();
  expect(submissions).toBe(2);
});

test('an existing request displays its saved plan and amount instead of the selected plan', async ({ page }) => {
  await page.route('**/rest/v1/rpc/member_pending_transfer_request', route => route.fulfill({ json: {
    id: '00000000-0000-4000-8000-000000009001', planName: '年費方案', amount: 17000,
    accountLastFive: '54321', submittedAt: '2026-09-23T00:00:00Z', status: 'pending',
  } }));
  await page.goto('/tests/pwa-frame-fixture.html?page=manual-transfer');
  await expect(page.getByText('待確認', { exact: true })).toBeVisible();
  const summary = page.locator('.manual-transfer-summary');
  await expect(summary).toContainText('年費方案');
  await expect(summary).toContainText('NT$17,000');
  await expect(summary).not.toContainText('月費方案');
  await expect(page.getByRole('button', { name: '提交', exact: true })).toBeDisabled();
});

test('a rejected duplicate attempt is not offered for replay after the other request is reviewed', async ({ page }) => {
  let submissions = 0;
  let otherReviewed = false;
  let rejectedId: string | undefined;
  await page.route('**/rest/v1/rpc/member_transfer_request_submit', route => {
    submissions += 1;
    const payload = route.request().postDataJSON();
    if (submissions === 1) {
      rejectedId = payload.p_request_id;
      return route.fulfill({ status: 409, json: {
        code: '23505', message: 'PENDING_TRANSFER_EXISTS', details: null, hint: null,
      } });
    }
    expect(payload.p_request_id).not.toBe(rejectedId);
    expect(payload.p_account_last_five).toBe('54321');
    return route.fulfill({ json: {
      id: payload.p_request_id, planName: '月費方案', amount: 2880,
      accountLastFive: '54321', submittedAt: '2026-09-24T00:00:00Z', status: 'pending',
    } });
  });
  await page.route('**/rest/v1/rpc/member_pending_transfer_request', route => {
    return submissions === 0 || otherReviewed
      ? route.fulfill({ contentType: 'application/json', body: 'null' })
      : route.fulfill({ json: {
        id: '00000000-0000-4000-8000-000000009002', planName: '月費方案', amount: 2880,
        accountLastFive: '99999', submittedAt: '2026-09-23T00:00:00Z', status: 'pending',
      } });
  });
  await page.goto('/tests/pwa-frame-fixture.html?page=manual-transfer');
  await page.getByLabel('帳號末五碼').fill('12345');
  const submit = page.getByRole('button', { name: /^(提交|重新確認申請|確認中)$/ });
  await expect(submit).toBeEnabled();
  await submit.click();
  await expect(page.getByText('待確認', { exact: true })).toBeVisible();
  await expect(submit).toBeDisabled();
  otherReviewed = true;
  await page.reload();
  await expect(page.getByText('申請狀態載入中')).toBeHidden();
  await expect(page.getByLabel('帳號末五碼')).toHaveValue('');
  await expect(page.getByRole('button', { name: '重新確認申請' })).toHaveCount(0);
  expect(submissions).toBe(1);
  await page.getByLabel('帳號末五碼').fill('54321');
  await expect(submit).toBeEnabled();
  await submit.click();
  await expect(page.getByText('待確認', { exact: true })).toBeVisible();
  expect(submissions).toBe(2);
});
