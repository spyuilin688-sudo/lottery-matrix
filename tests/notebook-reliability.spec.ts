import { expect, test } from '@playwright/test';
import { prepareLineMember, prepareReturningVisitor } from './helpers/product-runtime';

test.use({ viewport: { width: 390, height: 844 }, timezoneId: 'Asia/Taipei' });

test('notebook shortcut preserves cancelled note drafts and writes only notes', async ({ page }) => {
  await prepareReturningVisitor(page);
  await prepareLineMember(page, new Date('2027-01-01T00:30:00+08:00'));
  await page.clock.setFixedTime(new Date('2027-01-01T00:30:00+08:00'));
  await page.addInitScript(() => localStorage.setItem('matrix-quick-target', 'notebook'));
  await page.goto('/');
  await page.getByTestId('bottom-navigation').getByRole('button', { name: '快捷', exact: true }).click();
  await expect(page.getByRole('button', { name: '切換至紀錄模式' })).toHaveCount(0);
  await page.getByRole('button', { name: '新增筆記' }).click();
  await page.getByRole('textbox', { name: '筆記標題' }).fill('測試筆記');
  await page.getByRole('textbox', { name: '筆記內容' }).fill('保留筆記草稿');
  await page.getByRole('button', { name: '返回', exact: true }).click();
  const leave = page.getByRole('dialog', { name: '內容尚未儲存' });
  await expect(leave).toBeVisible();
  const bounds = await leave.boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
  await leave.getByRole('button', { name: '取消', exact: true }).click();
  await expect(page.getByRole('textbox', { name: '筆記內容' })).toHaveValue('保留筆記草稿');
  await page.getByRole('button', { name: '寫入筆記' }).click();
  await page.getByRole('dialog').getByRole('button', { name: '確認寫入' }).click();
  await expect(page.getByRole('button', { name: '展開筆記：測試筆記' })).toBeVisible();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('matrix-notebook:v2:00000000-0000-4000-8000-000000000001')!));
  expect(Object.keys(saved)).toEqual(['notes']);
  expect(saved.notes[0]).toMatchObject({ title: '測試筆記', content: '保留筆記草稿' });
});
