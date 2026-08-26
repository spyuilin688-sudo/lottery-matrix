import { expect, test } from "@playwright/test";

const phoneWidths = [320, 360, 375, 390, 412, 430];

for (const width of phoneWidths) {
  test(`member shell fits ${width}px without horizontal page overflow`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/");

    const canvas = page.getByTestId("app-mobile-canvas");
    await expect(canvas).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(width + 0.5);
  });
}
