import { expect, test } from "@playwright/test";

const phoneWidths = [320, 360, 375, 390, 412, 430];
const membershipPreviewPort = Number(process.env.MEMBERSHIP_PREVIEW_TEST_PORT ?? 4175);

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

const membershipWidths = [320, 360, 390, 430];

for (const width of membershipWidths) {
  test(`profile membership cards preserve mobile layout at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`http://127.0.0.1:${membershipPreviewPort}/qa/?inner=1&state=long`);

    const profile = page.locator(".profile-screen");
    await expect(profile).toBeVisible();

    const cards = profile.locator(".membership-card");
    await expect(cards).toHaveCount(2);

    const cardBoxes = await cards.evaluateAll((nodes) =>
      nodes.map((node) => {
        const rect = node.getBoundingClientRect();
        return {
          left: rect.left,
          right: rect.right,
          top: rect.top,
          bottom: rect.bottom,
          scrollWidth: node.scrollWidth,
          clientWidth: node.clientWidth,
        };
      }),
    );

    for (const box of cardBoxes) {
      expect(Math.abs(box.left - 16)).toBeLessThanOrEqual(0.5);
      expect(Math.abs(box.right - (width - 16))).toBeLessThanOrEqual(0.5);
      expect(box.scrollWidth).toBeLessThanOrEqual(box.clientWidth);
    }

    expect(Math.abs(cardBoxes[1].top - cardBoxes[0].bottom - 8)).toBeLessThanOrEqual(0.5);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

    for (const action of [
      page.getByRole("button", { name: "登出" }),
      page.getByRole("button", { name: "訂閱方案／收費標準" }),
    ]) {
      const box = await action.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.height).toBeGreaterThanOrEqual(44);
    }
  });
}
