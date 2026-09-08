import { expect, test, type Page } from '@playwright/test';

async function mockStatus(page: Page) {
  await page.route('https://**/functions/v1/matrix-status', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({
      kind: 'status', lottery: '今彩539', drawPeriod: '115217', analysisVersion: 'fixture:status',
      summary: {status: 'DORMANT', count: 0, message: '本期尚無符合條件的狀態。'},
      counts: {ACTIVE: 0, FOCUS: 0, RESONANCE: 0, CRITICAL: 0}, cards: [], customTriggers: [], detailLocked: true,
    }),
  }));
}

for (const width of [320, 360, 390, 430]) {
  test(`自訂條件在 ${width}px 保持單列中央分隔與群組收合編輯`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 844 });
    await page.route('https://**/rest/v1/rpc/**', async route => {
      const url = route.request().url();
      const body = url.endsWith('/matrix_custom_status_list')
        ? { items: [], entitlements: { canCustomizeStatus: true, canUseCompositeCustomRoad: true } }
        : url.endsWith('/matrix_custom_status_save')
          ? { item: route.request().postDataJSON().p_config } : {};
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    });
    await mockStatus(page);
    await page.goto('/tests/custom-status-layout-fixture.html?entry=1');
    await expect(page.locator('.matrix-custom-status-screen')).toHaveCount(0);
    await page.getByRole('button', {name: '自訂觸發條件，連續點擊兩下開啟'}).dblclick();
    await expect(page.getByText('使用預設條件', { exact: true })).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    const summary = page.getByRole('region', { name: '探索條件' });
    await expect(summary).toHaveText('探索期數：十三期|探索範圍：完整範圍');
    const metrics = await summary.evaluate(element => {
      const rect = element.getBoundingClientRect();
      const [left, separator, right] = Array.from(element.children).map(child => child.getBoundingClientRect());
      return {
        afterTabs: element.previousElementSibling?.getAttribute('role') === 'tablist',
        afterLottery: element.previousElementSibling?.previousElementSibling?.classList.contains('matrix-status-lottery-switcher'),
        colors: Array.from(element.querySelectorAll('span,strong')).map(child => getComputedStyle(child).color),
        color: getComputedStyle(element).color,
        centerError: Math.abs(separator.x + separator.width / 2 - rect.x - rect.width / 2),
        sameLine: Math.abs(left.y - right.y) < 1 && left.height < 24 && right.height < 24,
        height: rect.height,
        overflow: Array.from(element.children).some(child => child.scrollWidth > child.clientWidth + 1),
      };
    });
    expect(metrics.afterTabs).toBe(true);
    expect(metrics.afterLottery).toBe(true);
    expect(metrics.colors.every(color => color === metrics.color)).toBe(true);
    expect(metrics.centerError).toBeLessThan(1);
    expect(metrics.sameLine).toBe(true);
    expect(metrics.height).toBeLessThanOrEqual(32);
    expect(metrics.overflow).toBe(false);

    await page.getByRole('tab', { name: /共振/ }).click();
    const group = page.getByRole('article', { name: '一碼條件 條件群組 1', exact: true });
    const toggle = group.locator('summary');
    await expect(group.locator('details')).not.toHaveAttribute('open');
    await expect(group.getByRole('combobox', { name: '號碼排序' })).not.toBeVisible();
    expect((await group.boundingBox())!.height).toBeLessThanOrEqual(72);
    const actions = page.locator('.custom-status-actions');
    const navigation = page.getByTestId('bottom-navigation');
    const actionBox = (await actions.boundingBox())!;
    expect(actionBox.y + actionBox.height).toBeLessThanOrEqual((await navigation.boundingBox())!.y - 4);
    await page.screenshot({ path: testInfo.outputPath(`custom-status-${width}-collapsed.png`), animations: 'disabled' });
    await toggle.focus();
    await page.keyboard.press('Enter');
    await expect(group.getByRole('combobox', { name: '號碼排序' })).toBeVisible();
    const cardMetrics = await group.evaluate(element => ({
      height: element.getBoundingClientRect().height,
      fields: Array.from(element.querySelectorAll('select,input[type="number"]')).map(field => field.getBoundingClientRect().height),
      roadButtons: Array.from(element.querySelectorAll('.custom-status-road-options label')).map(label => label.getBoundingClientRect().height),
      overflow: element.scrollWidth > element.clientWidth + 1,
      labels: Array.from(element.querySelectorAll('.custom-status-field:not(.custom-status-field--roads) .custom-status-field-label')).map(label => label.getBoundingClientRect().x),
      fieldFont: getComputedStyle(element.querySelector('select')!).fontSize,
      roadWidth: element.querySelector('.custom-status-road-options')!.getBoundingClientRect().width,
      bodyWidth: element.querySelector('.custom-status-group-body')!.getBoundingClientRect().width,
    }));
    expect(cardMetrics.height).toBeLessThanOrEqual(330);
    expect(cardMetrics.fields.every(height => height >= 30 && height <= 31)).toBe(true);
    expect(cardMetrics.roadButtons.every(height => height >= 30 && height <= 31)).toBe(true);
    expect(cardMetrics.overflow).toBe(false);
    expect(new Set(cardMetrics.labels).size).toBe(1);
    expect(cardMetrics.fieldFont).toBe('13px');
    expect(Math.abs(cardMetrics.roadWidth - cardMetrics.bodyWidth)).toBeLessThan(1);
    await page.screenshot({ path: testInfo.outputPath(`custom-status-${width}-expanded.png`), animations: 'disabled' });
    const order = group.getByRole('combobox', { name: '號碼排序' });
    await order.selectOption('依實際開獎順序排序');
    await expect(page.getByText('已自訂', { exact: true })).toBeVisible();
    const minimum = group.getByRole('spinbutton', { name: '最少', exact: true });
    await minimum.fill('2');
    await toggle.click();
    await expect(order).not.toBeVisible();
    await page.getByRole('button', { name: '儲存設定', exact: true }).click();
    await expect(page.getByRole('alert')).toHaveText('同碼條數的最少不可大於最多');
    await expect(minimum).toBeFocused();
    await expect(group.locator('details')).toHaveAttribute('open', '');
    await minimum.fill('1');
    await toggle.click();
    await toggle.click();
    await expect(order).toHaveValue('依實際開獎順序排序');
    await page.getByRole('button', { name: '儲存設定', exact: true }).click();
    await expect(page.getByText('設定已儲存並套用至首頁', { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const addedNumber = await page.getByRole('region', { name: '一碼條件', exact: true }).getByRole('article').count() + 1;
    await page.getByRole('button', { name: '新增一碼條件群組', exact: true }).click();
    const added = page.getByRole('article', { name: `一碼條件 條件群組 ${addedNumber}`, exact: true });
    await expect(added.locator('details')).toHaveAttribute('open', '');
    await added.getByRole('button', { name: `一碼條件 刪除條件群組 ${addedNumber}`, exact: true }).click();
    await expect(added).toHaveCount(0);
    const twoCode = page.getByRole('article', { name: '兩碼條件 條件群組 1', exact: true });
    await twoCode.locator('summary').click();
    const endpoint = twoCode.getByRole('combobox', { name: '連準終點', exact: true });
    await endpoint.selectOption('11');
    expect(await endpoint.evaluate(element => {
      const select = element as HTMLSelectElement;
      const style = getComputedStyle(select);
      const context = document.createElement('canvas').getContext('2d')!;
      context.font = style.font;
      return context.measureText(select.selectedOptions[0].text).width + parseFloat(style.paddingLeft) + parseFloat(style.paddingRight) + 20 <= select.clientWidth;
    })).toBe(true);
    console.log(`Custom status ${width}px: collapsed <=72px; open ${cardMetrics.height}px; 13px type / 30px fields; keyboard, error focus, draft, save and add/delete passed`);
  });
}

for (const width of [320, 360, 390, 430]) {
  for (const reason of ['guest', 'forbidden'] as const) {
    test(`${width}px ${reason} 在入口跳出提醒，沒有進入自訂頁或顯示權限卡`, async ({page}, testInfo) => {
      await page.setViewportSize({width, height:844});
      await mockStatus(page);
      await page.route('https://**/rest/v1/rpc/matrix_custom_status_list', route => route.fulfill({
        status: 200, contentType:'application/json',
        body:JSON.stringify({items:[],entitlements:{canCustomizeStatus:false}}),
      }));
      await page.goto(`/tests/custom-status-layout-fixture.html?entry=1${reason === 'guest' ? '&guest=1' : ''}`);
      const trigger=page.getByRole('button',{name:'自訂觸發條件，連續點擊兩下開啟'});
      await trigger.dblclick();
      const dialog=page.getByRole('dialog');
      await expect(dialog).toBeVisible();
      await expect(dialog).toContainText(reason === 'guest'
        ? '請先登入後再使用自訂觸發條件' : '目前 Matrix Pro 方案不符合自訂觸發條件的使用權限');
      await expect(page.locator('.matrix-status-screen')).toBeVisible();
      await expect(page.locator('.matrix-custom-status-screen')).toHaveCount(0);
      await expect(page.locator('.custom-status-access-notice')).toHaveCount(0);
      const box=(await dialog.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x+box.width).toBeLessThanOrEqual(width);
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.y+box.height).toBeLessThanOrEqual(844);
      await page.screenshot({path:testInfo.outputPath(`custom-status-${width}-${reason}-entry.png`),animations:'disabled'});
      await dialog.getByRole('button',{name:'知道了'}).click();
      await expect(dialog).not.toBeVisible();
      await expect(trigger).toBeFocused();
      await expect(page.locator('.matrix-custom-status-screen')).toHaveCount(0);
    });
  }
}
