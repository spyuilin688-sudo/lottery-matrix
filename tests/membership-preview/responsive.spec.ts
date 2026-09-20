import { expect, test } from "@playwright/test";

const membershipWidths = [320, 360, 390, 430];
const paidScenarios = [
  { state: "year", planName: "年費方案" },
  { state: "long", planName: "年費方案" },
  { state: "lifetime", planName: "終身方案" },
];

const measureDescription = (node: Element) => {
  const box = node.getBoundingClientRect();
  const textRange = document.createRange();
  textRange.selectNodeContents(node);
  const textBox = textRange.getBoundingClientRect();
  return {
    left: Math.min(box.left, textBox.left),
    right: Math.max(box.right, textBox.right),
    top: Math.min(box.top, textBox.top),
    bottom: Math.max(box.bottom, textBox.bottom),
    scrollHeight: node.scrollHeight,
    clientHeight: node.clientHeight,
  };
};

for (const { state, planName } of paidScenarios) {
  for (const width of membershipWidths) {
    test(`profile ${state} membership cards keep paid details clear of the action at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`/qa/?inner=1&state=${state}`);

      const profile = page.locator(".profile-screen");
      await expect(profile).toBeVisible();
      const description = profile.locator(".subscription-plan p");
      // Measure the settled paid state, never the initially empty loading copy.
      await expect(profile.locator(".subscription-plan strong")).toHaveText(planName);
      await expect(description).toHaveText("依目前方案享有 Matrix Pro 權限");
      await page.evaluate(() => document.fonts.ready);

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

      for (const box of cardBoxes) {
        expect(box.scrollWidth).toBeLessThanOrEqual(box.clientWidth);
        expect(box.top).toBeGreaterThanOrEqual(stackBox.top - 0.5);
        expect(box.bottom).toBeLessThanOrEqual(stackBox.bottom + 0.5);
      }

      // The shared artwork retains contiguous profile and subscription sections.
      expect(Math.abs(cardBoxes[1].top - cardBoxes[0].bottom)).toBeLessThanOrEqual(0.5);
      // The cropped profile artwork occupies 21.69% of the stack width at every viewport.
      expect(cardBoxes[0].height / (width - 12)).toBeLessThanOrEqual(0.26);

      const descriptionBox = await description.evaluate(measureDescription);
      const entryBox = await page.getByRole("button", { name: "訂閱方案／收費標準" }).boundingBox();
      expect(entryBox).not.toBeNull();
      expect(descriptionBox.bottom + 8).toBeLessThanOrEqual(entryBox!.y + 0.5);
      expect(descriptionBox.top).toBeGreaterThanOrEqual(cardBoxes[1].top - 0.5);
      expect(descriptionBox.bottom).toBeLessThanOrEqual(cardBoxes[1].bottom + 0.5);
      expect(descriptionBox.left).toBeGreaterThanOrEqual(cardBoxes[1].left - 0.5);
      expect(descriptionBox.right).toBeLessThanOrEqual(cardBoxes[1].right + 0.5);
      expect(descriptionBox.scrollHeight).toBeLessThanOrEqual(descriptionBox.clientHeight + 1);
      expect(entryBox!.y + entryBox!.height).toBeLessThanOrEqual(cardBoxes[1].bottom + 0.5);
      // Wrapped copy determines the height. Bound spare space below the final action
      // to the frame inset instead of imposing a ratio that can clip paid details.
      expect(stackBox.bottom - (entryBox!.y + entryBox!.height)).toBeLessThanOrEqual(24);
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

      for (const action of [
        page.getByRole("button", { name: "登出" }),
        page.getByRole("button", { name: "訂閱方案／收費標準" }),
      ]) {
        const box = await action.boundingBox();
        expect(box).not.toBeNull();
        expect(box!.height).toBeGreaterThanOrEqual(44);
        expect(box!.width).toBeGreaterThanOrEqual(44);
      }

    });
  }
}

for (const width of [320, 430]) {
  test(`profile lifetime details remain below the title with purchase hidden at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/qa/?inner=1&state=lifetime-hidden");

    const card = page.locator(".subscription-status-card");
    const description = card.locator(".subscription-plan p");
    await expect(card.locator(".subscription-plan strong")).toHaveText("終身方案");
    await expect(description).toHaveText("依目前方案享有 Matrix Pro 權限");
    await expect(card.getByRole("button", { name: "訂閱方案／收費標準" })).toHaveCount(0);
    await page.evaluate(() => document.fonts.ready);

    const cardBox = await card.boundingBox();
    const titleBox = await card.locator(".section-title").boundingBox();
    const contentBox = await card.locator(".subscription-status-content").boundingBox();
    expect(cardBox).not.toBeNull();
    expect(titleBox).not.toBeNull();
    expect(contentBox).not.toBeNull();
    expect(Math.abs(contentBox!.y - (titleBox!.y + titleBox!.height) - 8)).toBeLessThanOrEqual(0.5);

    const descriptionBox = await description.evaluate(measureDescription);
    expect(descriptionBox.top).toBeGreaterThanOrEqual(cardBox!.y - 0.5);
    expect(descriptionBox.bottom).toBeLessThanOrEqual(cardBox!.y + cardBox!.height + 0.5);
    expect(descriptionBox.left).toBeGreaterThanOrEqual(cardBox!.x - 0.5);
    expect(descriptionBox.right).toBeLessThanOrEqual(cardBox!.x + cardBox!.width + 0.5);
    expect(descriptionBox.scrollHeight).toBeLessThanOrEqual(descriptionBox.clientHeight + 1);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}
