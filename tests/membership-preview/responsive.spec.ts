import { expect, test } from "@playwright/test";

const membershipWidths = [320, 360, 390, 430];

for (const width of membershipWidths) {
  test(`profile membership cards preserve the approved A+B mobile composition at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/qa/?inner=1&state=long");

    const profile = page.locator(".profile-screen");
    await expect(profile).toBeVisible();

    const stack = profile.locator(".membership-card-stack");
    await expect(stack).toHaveCount(1);

    const cards = stack.locator(".membership-card");
    await expect(cards).toHaveCount(2);

    const stackBox = await stack.evaluate((node) => {
      const rect = node.getBoundingClientRect();
      return {
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
        height: rect.height,
        scrollWidth: node.scrollWidth,
        clientWidth: node.clientWidth,
      };
    });
    const cardBoxes = await cards.evaluateAll((nodes) =>
      nodes.map((node) => {
        const rect = node.getBoundingClientRect();
        return {
          left: rect.left,
          right: rect.right,
          top: rect.top,
          bottom: rect.bottom,
          height: rect.height,
          scrollWidth: node.scrollWidth,
          clientWidth: node.clientWidth,
        };
      }),
    );

    // DESIGN.md: the artwork extends 10px into each 16px page gutter.
    expect(Math.abs(stackBox.left - 6)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(stackBox.right - (width - 6))).toBeLessThanOrEqual(0.5);
    expect(stackBox.scrollWidth).toBeLessThanOrEqual(stackBox.clientWidth);
    const stackRatioLimit = width <= 320 ? 0.78 : width <= 360 ? 0.69 : width <= 390 ? 0.66 : 0.62;
    expect(stackBox.height / (width - 12)).toBeLessThanOrEqual(stackRatioLimit);

    for (const box of cardBoxes) {
      expect(box.scrollWidth).toBeLessThanOrEqual(box.clientWidth);
      expect(box.top).toBeGreaterThanOrEqual(stackBox.top - 0.5);
      expect(box.bottom).toBeLessThanOrEqual(stackBox.bottom + 0.5);
    }

    // The approved shared artwork uses contiguous absolute-positioned data overlays,
    // not two independently framed cards with a 1px flex/grid gap.
    expect(Math.abs(cardBoxes[1].top - cardBoxes[0].bottom)).toBeLessThanOrEqual(0.5);
    // The cropped profile artwork occupies 21.69% of the stack width at every viewport.
    expect(cardBoxes[0].height / (width - 12)).toBeLessThanOrEqual(0.26);
    expect(cardBoxes[1].height / (width - 12)).toBeLessThanOrEqual(width <= 320 ? 0.45 : width <= 360 ? 0.41 : 0.37);
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
