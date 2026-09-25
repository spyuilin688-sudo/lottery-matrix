import { expect, test } from "@playwright/test";

const membershipWidths = [320, 360, 375, 390, 412, 430];
const membershipScenarios = [
  { state: "free", planName: "免費會員", tier: "free", description: "核心功能體驗" },
  { state: "monthly", planName: "月費方案", tier: "monthly", description: "Matrix Pro 權限" },
  { state: "quarterly", planName: "季費方案", tier: "quarterly", description: "Matrix Pro 權限" },
  { state: "year", planName: "年費方案", tier: "yearly", description: "Matrix Pro 權限" },
  { state: "long", planName: "年費方案", tier: "yearly", description: "Matrix Pro 權限" },
  { state: "lifetime", planName: "終身方案", tier: "lifetime", description: "Matrix Pro 權限" },
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
    lineHeight: parseFloat(getComputedStyle(node).lineHeight),
  };
};

test("membership preview loads the approved A+B artwork", async ({ page }) => {
  await page.goto("/qa/?inner=1&state=year");
  const artworkLoaded = await page.evaluate(async () => {
    const artwork = new Image();
    artwork.src = "/assets/lottery/membership/membership-ab-reference.png";
    try {
      await artwork.decode();
      return artwork.naturalWidth === 1563 && artwork.naturalHeight === 1006;
    } catch {
      return false;
    }
  });
  expect(artworkLoaded).toBe(true);
});

for (const { state, planName, tier, description: expectedDescription } of membershipScenarios) {
  for (const width of membershipWidths) {
    test(`profile ${state} membership cards keep paid details clear of the action at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`/qa/?inner=1&state=${state}`);

      const profile = page.locator(".profile-screen");
      await expect(profile).toBeVisible();
      const description = profile.locator(".subscription-plan p");
      // Measure the settled paid state, never the initially empty loading copy.
      await expect(profile.locator(".subscription-plan strong")).toHaveText(planName);
      await expect(description).toHaveText(expectedDescription);
      await page.evaluate(() => document.fonts.ready);

      const subscriptionCard = profile.locator(".subscription-status-card");
      await expect(subscriptionCard).toHaveAttribute("data-plan-tier", tier);
      await expect(profile.locator(".subscription-entry-art-mask")).toHaveCount(0);
      await expect(subscriptionCard.locator(".subscription-status-stage")).toHaveCSS("border-style", "none");
      await expect(subscriptionCard.locator(".subscription-status-stage")).toHaveCSS("box-shadow", "none");
      await expect(subscriptionCard.locator(".subscription-status-stage")).toHaveCSS("border-radius", "0px");
      await expect(subscriptionCard.locator(".subscription-status-stage")).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
      const plan = subscriptionCard.locator(".subscription-plan");
      const expiry = subscriptionCard.locator(".subscription-expiry");
      const emblem = subscriptionCard.locator(".subscription-status-emblem");
      const [planBox, expiryBox, emblemBox] = await Promise.all([plan.boundingBox(), expiry.boundingBox(), emblem.boundingBox()]);
      expect(planBox).not.toBeNull();
      expect(expiryBox).not.toBeNull();
      expect(emblemBox).not.toBeNull();
      expect(expiryBox!.y).toBeGreaterThan(planBox!.y + planBox!.height);
      // Plan and expiry share one text column; the whole information group is centered.
      expect(Math.abs(expiryBox!.x - planBox!.x)).toBeLessThanOrEqual(0.5);
      expect(Math.abs(expiryBox!.x + expiryBox!.width - planBox!.x - planBox!.width)).toBeLessThanOrEqual(0.5);
      expect(emblemBox!.x + emblemBox!.width).toBeLessThanOrEqual(planBox!.x + 0.5);
      const detailsCenterY = (planBox!.y + expiryBox!.y + expiryBox!.height) / 2;
      expect(Math.abs(emblemBox!.y + emblemBox!.height / 2 - detailsCenterY)).toBeLessThanOrEqual(0.5);
      const cardBox = await subscriptionCard.boundingBox();
      const groupCenterX = (emblemBox!.x + expiryBox!.x + expiryBox!.width) / 2;
      expect(Math.abs(groupCenterX - cardBox!.x - cardBox!.width / 2)).toBeLessThanOrEqual(0.5);

      const menus = profile.locator('.profile-menu');
      await expect(menus).toHaveCount(5);
      for (const menu of await menus.all()) {
        await expect(menu).toHaveCSS('background-image', 'none');
        await expect(menu).toHaveCSS('background-color', 'rgb(2, 7, 12)');
        await expect(menu).toHaveCSS('border-top-color', 'rgb(138, 113, 63)');
        await expect(menu.locator('.section-title > span')).toHaveCSS('opacity', '0.78');
        const box = await menu.boundingBox();
        expect(box!.x).toBeGreaterThanOrEqual(0);
        expect(box!.x + box!.width).toBeLessThanOrEqual(width);
        for (const chevron of await menu.locator('.profile-menu-rows button svg').all()) {
          await expect(chevron).toHaveCSS('opacity', '0.72');
          await expect(chevron).toHaveCSS('width', '16px');
          await expect(chevron).toHaveCSS('height', '16px');
        }
      }

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
      const contentLastLineBottom = await subscriptionCard.locator(".subscription-status-content").evaluate((content) => {
        return Math.max(...[...content.querySelectorAll("span, strong, p")]
          .filter((node) => node.textContent?.trim())
          .map((node) => node.getBoundingClientRect().bottom));
      });
      expect(contentLastLineBottom + 8).toBeLessThanOrEqual(entryBox!.y + 0.5);
      expect(descriptionBox.top).toBeGreaterThanOrEqual(cardBoxes[1].top - 0.5);
      expect(descriptionBox.bottom).toBeLessThanOrEqual(cardBoxes[1].bottom + 0.5);
      expect(descriptionBox.left).toBeGreaterThanOrEqual(cardBoxes[1].left - 0.5);
      expect(descriptionBox.right).toBeLessThanOrEqual(cardBoxes[1].right + 0.5);
      expect(descriptionBox.scrollHeight).toBeLessThanOrEqual(descriptionBox.clientHeight + 1);
      expect(Math.abs(descriptionBox.clientHeight - descriptionBox.lineHeight)).toBeLessThanOrEqual(1);
      expect(entryBox!.y + entryBox!.height).toBeLessThanOrEqual(cardBoxes[1].bottom + 0.5);
      for (const box of [planBox!, expiryBox!, emblemBox!, entryBox!]) {
        expect(box.x).toBeGreaterThanOrEqual(cardBoxes[1].left - 0.5);
        expect(box.x + box.width).toBeLessThanOrEqual(cardBoxes[1].right + 0.5);
        expect(box.y).toBeGreaterThanOrEqual(cardBoxes[1].top - 0.5);
        expect(box.y + box.height).toBeLessThanOrEqual(cardBoxes[1].bottom + 0.5);
      }
      for (const value of [plan.locator("strong"), expiry.locator("strong"), expiry.locator("p")]) {
        if (!(await value.textContent())?.trim()) continue;
        const textBox = await value.evaluate(measureDescription);
        expect(textBox.left).toBeGreaterThanOrEqual(cardBoxes[1].left - 0.5);
        expect(textBox.right).toBeLessThanOrEqual(cardBoxes[1].right + 0.5);
        expect(textBox.scrollHeight).toBeLessThanOrEqual(textBox.clientHeight + 1);
      }
      // Content determines the height. Bound spare space below the final action
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

test("five visual tiers use five distinct backgrounds and plan colors", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  const backgrounds = new Set<string>();
  const colors = new Set<string>();
  const crownAssets = new Set<string>();
  for (const { state, planName, tier } of membershipScenarios.filter(({ state }) => state !== "long")) {
    await page.goto(`/qa/?inner=1&state=${state}`);
    const card = page.locator(".subscription-status-card");
    await expect(card.locator(".subscription-plan strong")).toHaveText(planName);
    await expect(card).toHaveAttribute("data-plan-tier", tier);
    const stage = card.locator(".subscription-status-stage");
    backgrounds.add(`${await stage.evaluate((node) => getComputedStyle(node).backgroundImage)} ${await stage.evaluate((node) => getComputedStyle(node).backgroundColor)}`);
    colors.add(await card.locator(".subscription-plan strong").evaluate((node) => getComputedStyle(node).color));
    const emblemUrl = `/assets/lottery/membership/subscription/${tier}-crown.svg`;
    await expect(card.locator(".subscription-status-emblem")).toHaveCSS("background-image", `url("${new URL(emblemUrl, page.url()).href}")`);
    crownAssets.add(emblemUrl);
    const crownIsVisible = await page.evaluate(async (src) => {
      const crown = new Image();
      crown.src = src;
      try {
        await crown.decode();
        const canvas = document.createElement("canvas");
        canvas.width = crown.naturalWidth;
        canvas.height = crown.naturalHeight;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (!context) return false;
        context.drawImage(crown, 0, 0);
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
        let visiblePixels = 0;
        for (let index = 3; index < pixels.length; index += 4) {
          if (pixels[index] > 128) visiblePixels += 1;
        }
        return visiblePixels > 100;
      } catch {
        return false;
      }
    }, emblemUrl);
    expect(crownIsVisible).toBe(true);
  }
  expect(backgrounds.size).toBe(5);
  expect(colors.size).toBe(5);
  expect(crownAssets.size).toBe(5);
});

for (const width of [320, 430]) {
  test(`profile lifetime details remain below the title with purchase hidden at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/qa/?inner=1&state=lifetime-hidden");

    const card = page.locator(".subscription-status-card");
    const description = card.locator(".subscription-plan p");
    await expect(card.locator(".subscription-plan strong")).toHaveText("終身方案");
    await expect(description).toHaveText("Matrix Pro 權限");
    await expect(card.getByRole("button", { name: "訂閱方案／收費標準" })).toHaveCount(0);
    await expect(page.locator(".membership-reference-art .subscription-entry-art-mask")).toHaveCount(1);
    await page.evaluate(() => document.fonts.ready);

    const cardBox = await card.boundingBox();
    const titleBox = await card.locator(".section-title").boundingBox();
    const stageBox = await card.locator(".subscription-status-stage").boundingBox();
    expect(cardBox).not.toBeNull();
    expect(titleBox).not.toBeNull();
    expect(stageBox).not.toBeNull();
    expect(Math.abs(stageBox!.y - (titleBox!.y + titleBox!.height) - 8)).toBeLessThanOrEqual(0.5);

    const descriptionBox = await description.evaluate(measureDescription);
    expect(descriptionBox.top).toBeGreaterThanOrEqual(cardBox!.y - 0.5);
    expect(descriptionBox.bottom).toBeLessThanOrEqual(cardBox!.y + cardBox!.height + 0.5);
    expect(descriptionBox.left).toBeGreaterThanOrEqual(cardBox!.x - 0.5);
    expect(descriptionBox.right).toBeLessThanOrEqual(cardBox!.x + cardBox!.width + 0.5);
    expect(descriptionBox.scrollHeight).toBeLessThanOrEqual(descriptionBox.clientHeight + 1);
    expect(Math.abs(descriptionBox.clientHeight - descriptionBox.lineHeight)).toBeLessThanOrEqual(1);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}
