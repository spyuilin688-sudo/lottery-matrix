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

    expect(Math.abs(stackBox.left - 16)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(stackBox.right - (width - 16))).toBeLessThanOrEqual(0.5);
    expect(stackBox.scrollWidth).toBeLessThanOrEqual(stackBox.clientWidth);
    const stackRatioLimit = width <= 320 ? 0.78 : width <= 360 ? 0.69 : width <= 390 ? 0.66 : 0.61;
    expect(stackBox.height / (width - 32)).toBeLessThanOrEqual(stackRatioLimit);

    for (const box of cardBoxes) {
      expect(box.scrollWidth).toBeLessThanOrEqual(box.clientWidth);
    }

    expect(Math.abs(cardBoxes[1].top - cardBoxes[0].bottom - 1)).toBeLessThanOrEqual(0.5);
    expect(cardBoxes[0].height / (width - 32)).toBeLessThanOrEqual(width <= 320 ? 0.26 : 0.23);
    expect(cardBoxes[1].height / (width - 32)).toBeLessThanOrEqual(width <= 320 ? 0.45 : width <= 360 ? 0.41 : 0.37);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

    for (const action of [
      page.getByRole("button", { name: "登出" }),
      page.getByRole("button", { name: "訂閱方案／收費標準" }),
    ]) {
      const box = await action.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.height).toBeGreaterThanOrEqual(44);
    }

    if (width === 390) {
      await page.goto("/qa/?inner=1&state=year");
      await expect(page.getByRole("button", { name: "登出" })).toBeVisible();
      await page.locator(".profile-avatar img").evaluate((node) => {
        (node as HTMLImageElement).src = "/qa/assets/lottery/matrix-profile-avatar.jpg";
      });
      await page.locator(".subscription-crown").evaluate((node) => {
        (node as HTMLImageElement).src = "/qa/assets/lottery/membership/membership-emblem.png";
      });
      await expect.poll(() => page.locator(".subscription-crown").evaluate((node) => (node as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
      await page.evaluate(() => document.fonts.ready);
      const capture = await stack.screenshot({ type: "jpeg", quality: 85 });
      console.log(`MEMBERSHIP_CARD_CAPTURE:${capture.toString("base64")}`);
    }
  });
}
