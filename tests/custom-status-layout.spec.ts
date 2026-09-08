import { expect, test } from '@playwright/test';

for (const width of [320, 360, 390, 430]) {
  test(`自訂條件在 ${width}px 保持單列中央分隔與緊湊群組`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.route('https://**/rest/v1/rpc/**', async route => {
      const url = route.request().url();
      const body = url.endsWith('/matrix_custom_status_list')
        ? { items: [], entitlements: { canCustomizeStatus: true, canUseCompositeCustomRoad: true } }
        : url.endsWith('/matrix_custom_status_save')
          ? { item: route.request().postDataJSON().p_config } : {};
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    });
    await page.goto('/tests/custom-status-layout-fixture.html');
    await expect(page.getByText('使用預設條件', { exact: true })).toBeVisible();
    const summary = page.getByRole('region', { name: '探索條件' });
    await expect(summary).toHaveText('探索期數：十三期|探索範圍：完整範圍');
    const metrics = await summary.evaluate(element => {
      const rect = element.getBoundingClientRect();
      const [left, separator, right] = Array.from(element.children).map(child => child.getBoundingClientRect());
      return {
        centerError: Math.abs(separator.x + separator.width / 2 - rect.x - rect.width / 2),
        sameLine: Math.abs(left.y - right.y) < 1 && left.height < 24 && right.height < 24,
        height: rect.height,
        overflow: Array.from(element.children).some(child => child.scrollWidth > child.clientWidth + 1),
      };
    });
    expect(metrics.centerError).toBeLessThan(1);
    expect(metrics.sameLine).toBe(true);
    expect(metrics.height).toBeLessThanOrEqual(32);
    expect(metrics.overflow).toBe(false);

    await page.getByRole('tab', { name: /共振/ }).click();
    const group = page.getByRole('article', { name: '一碼條件 條件群組 1', exact: true });
    const cardMetrics = await group.evaluate(element => ({
      height: element.getBoundingClientRect().height,
      fields: Array.from(element.querySelectorAll('select,input[type="number"]')).map(field => field.getBoundingClientRect().height),
      roadButtons: Array.from(element.querySelectorAll('.custom-status-road-options label')).map(label => label.getBoundingClientRect().height),
      overflow: element.scrollWidth > element.clientWidth + 1,
    }));
    expect(cardMetrics.height).toBeLessThanOrEqual(260);
    expect(cardMetrics.fields.every(height => height >= 28 && height <= 29)).toBe(true);
    expect(cardMetrics.roadButtons.every(height => height >= 28 && height <= 29)).toBe(true);
    expect(cardMetrics.overflow).toBe(false);
    const order = group.getByRole('combobox', { name: '號碼排序' });
    await order.selectOption('依實際開獎順序排序');
    await expect(page.getByText('已自訂', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: '儲存設定', exact: true }).click();
    await expect(page.getByText('設定已儲存並套用至首頁', { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    console.log(`Custom status ${width}px: centered single row; group ${cardMetrics.height}px; 28px fields; save passed`);
  });
}
