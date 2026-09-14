import { expect, test, type Page } from '@playwright/test';

async function expectPageInsets(page: Page) {
  const layout = await page.locator('.feature-body').evaluate((body) => {
    const first = body.firstElementChild!.getBoundingClientRect();
    const screen = body.parentElement!.getBoundingClientRect();
    return {
      left: first.left - screen.left,
      right: screen.right - first.right,
      overflow: document.documentElement.scrollWidth > window.innerWidth,
      contentOverflow: body.scrollWidth > body.clientWidth,
    };
  });
  expect(layout).toEqual({ left: 16, right: 16, overflow: false, contentOverflow: false });
}

for (const width of [320, 360, 390, 430]) {
  test(`notebook list and editor fit ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 844 });
    await page.addInitScript(() => {
      localStorage.clear();
    });
    await page.goto('/tests/notebook-responsive-fixture.html');
    await expect(page.getByRole('heading', { name: 'MATRIX 筆記本', exact: true })).toBeVisible();
    await expect(page.getByRole('region', { name: '筆記列表' })).toBeVisible();
    await expectPageInsets(page);
    const toolbar = await page.locator('.notebook-heading').evaluate((heading) => {
      const rect = (selector: string) => heading.querySelector(selector)!.getBoundingClientRect();
      const left = rect(':scope > img');
      const actions = rect('.notebook-note-actions');
      const add = rect('.notebook-note-actions > button:last-child');
      const remove = rect('.notebook-delete-action');
      return {
        leftGap: actions.left - left.right,
        iconSizes: Array.from(heading.querySelectorAll('img')).map((img) => [img.width, img.height]),
        buttonHeights: [add.height, remove.height],
        equalWidths: add.width === remove.width,
        addFontSize: getComputedStyle(heading.querySelector('.notebook-note-actions > button:last-child')!).fontSize,
        hasDuplicateTitle: Boolean(heading.querySelector('h2')),
      };
    });
    expect(toolbar).toEqual({ leftGap: 8, iconSizes: [[42, 42]], buttonHeights: [26, 26], equalWidths: true, addFontSize: '11px', hasDuplicateTitle: false });
    await expect(page.locator('.notebook-entry-open').first()).toHaveCSS('padding-top', '5px');
    await expect(page.locator('.notebook-entry-open').first()).toHaveCSS('padding-bottom', '5px');
    await page.screenshot({ path: testInfo.outputPath(`notebook-list-${width}.png`), fullPage: true });

    await page.getByRole('button', { name: '展開筆記：第一張筆記', exact: true }).click();
    await expect(page.getByRole('textbox', { name: '筆記內容' })).toHaveValue('保留原有內容');
    await expect(page.getByRole('heading', { name: 'MATRIX 筆記本', exact: true })).toBeVisible();
    await expectPageInsets(page);
    const editor = page.locator('.matrix-notebook-editor');
    await expect(editor).toHaveCSS('padding-top', '8px');
    const gaps = await editor.evaluate((element) => ({
      titleGap: element.getBoundingClientRect().top - document.querySelector('.feature-brand-header')!.getBoundingClientRect().bottom,
      returnGap: element.querySelector('input')!.getBoundingClientRect().top - element.querySelector('header')!.getBoundingClientRect().bottom,
    }));
    expect(gaps).toEqual({ titleGap: 8, returnGap: 8 });
    const title = page.getByRole('textbox', { name: '筆記標題' });
    const content = page.getByRole('textbox', { name: '筆記內容' });
    for (const edge of ['top', 'left', 'bottom']) await expect(title).toHaveCSS(`padding-${edge}`, '5px');
    for (const edge of ['top', 'left', 'right']) await expect(content).toHaveCSS(`padding-${edge}`, '5px');
    const save = page.getByRole('button', { name: '寫入筆記' });
    await expect(save).toHaveCSS('height', '36px');
    await expect(save).toHaveCSS('font-size', '14px');
    await expect(save).toHaveClass(/branded-explore-action/);
    await page.screenshot({ path: testInfo.outputPath(`notebook-editor-${width}.png`), fullPage: true });

    await page.getByRole('button', { name: '返回列表' }).click();
    await expect(page.getByRole('button', { name: '切換至紀錄模式' })).toHaveCount(0);
    await expect(page.locator('.notebook-mode-switch')).toHaveCount(0);

  });
}
