import { expect, test } from '@playwright/test';
import { prepareLineMember, prepareReturningVisitor } from './helpers/product-runtime';

test.use({ viewport: { width: 390, height: 844 }, timezoneId: 'Asia/Taipei' });

test('notebook shortcut preserves cancelled drafts and saves the displayed Taipei date', async ({ page }) => {
  await prepareReturningVisitor(page);
  await prepareLineMember(page, new Date('2027-01-01T00:30:00+08:00'));
  await page.clock.setFixedTime(new Date('2027-01-01T00:30:00+08:00'));
  await page.addInitScript(() => localStorage.setItem('matrix-quick-target', 'notebook'));
  await page.goto('/');
  await page.getByTestId('bottom-navigation').getByRole('button', { name: '快捷', exact: true }).click();
  await page.getByRole('button', { name: '切換至紀錄模式' }).click();
  await page.getByRole('button', { name: '新增紀錄' }).click();
  await page.getByRole('button', { name: '選取號碼', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: '07', exact: true }).click();
  await page.getByRole('button', { name: '完成', exact: true }).click();
  await page.locator('.record-tag-options').getByRole('button', { name: '單號', exact: true }).click();
  await page.getByRole('button', { name: '返回', exact: true }).click();
  const leave = page.getByRole('dialog', { name: '內容尚未儲存' });
  await expect(leave).toBeVisible();
  const bounds = await leave.boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
  await leave.getByRole('button', { name: '取消', exact: true }).click();
  await expect(page.getByRole('button', { name: '07', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '日期', exact: true }).click();
  await expect(page.locator('.record-week-row button[data-selected="true"]')).toHaveText('五1');
  await page.locator('.record-week-row').getByRole('button', { name: /^四\s*31$/ }).click();
  await page.getByRole('button', { name: '新增紀錄', exact: true }).click();
  await expect(page.locator('.notebook-record-card')).toHaveCount(0);
  await page.getByRole('button', { name: '本週', exact: true }).click();
  await expect(page.locator('.notebook-record-card')).toHaveCount(1);
  const dates = await page.evaluate(() => JSON.parse(localStorage.getItem('matrix-notebook:v1:00000000-0000-4000-8000-000000000001')!).records.map((record: { date: string }) => record.date));
  expect(dates).toEqual(['2026-12-31']);
});
