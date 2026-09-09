import { expect, test } from "@playwright/test";

const viewports = [
  { width: 320, height: 568 },
  { width: 360, height: 740 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
  { width: 390, height: 1000 },
  { width: 844, height: 390 },
  { width: 1363, height: 936 },
];

for (const viewport of viewports) {
  test(`首頁 Logo 比例與狀態卡到 Core 實際間距 ${viewport.width}x${viewport.height}`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    await page.addInitScript(() => localStorage.setItem("matrix-first-visit-guide-seen", "1"));
    await page.goto("/");
    const home = page.locator(".home-screen");
    await expect(home.locator(".matrix-status-card")).toHaveCount(4);
    await expect.poll(() => home.locator("img").evaluateAll((images) => images.every((image) => {
      const img = image as HTMLImageElement;
      return img.complete && img.naturalWidth > 0;
    }))).toBe(true);

    const geometry = await home.evaluate((root) => {
      const logo = root.querySelector<HTMLImageElement>(".home-logo-image")!;
      const logoRect = logo.getBoundingClientRect();
      const header = root.querySelector(".brand-header")!.getBoundingClientRect();
      const cards = Array.from(root.querySelectorAll(".matrix-status-card"));
      const core = root.querySelector(".matrix-core-banner")!.getBoundingClientRect();
      const canvas = root.getBoundingClientRect();
      const switcher = root.querySelector(".lottery-switcher")!;
      const switcherTop = switcher.getBoundingClientRect().top;
      const transform = getComputedStyle(logo).transform;
      logo.style.transform = "none";
      const originalLogo = logo.getBoundingClientRect();
      const originalSwitcherTop = switcher.getBoundingClientRect().top;
      logo.style.removeProperty("transform");
      return {
        transform,
        logoTopDelta: logoRect.top - originalLogo.top,
        logoHeightDelta: logoRect.height - originalLogo.height,
        switcherTopDelta: switcherTop - originalSwitcherTop,
        logoWidth: logoRect.width,
        expectedLogoWidth: header.width * 0.87584 * 1.05,
        logoHeight: logoRect.height,
        expectedLogoHeight: logoRect.width * logo.naturalHeight / logo.naturalWidth,
        cardCoreGap: core.top - Math.max(...cards.map((card) => card.getBoundingClientRect().bottom)),
        logoInsetLeft: logoRect.left - canvas.left,
        logoInsetRight: canvas.right - logoRect.right,
        horizontalOverflow: document.documentElement.scrollWidth - innerWidth,
      };
    });
    console.log(JSON.stringify({ viewport, ...geometry }));
    expect(geometry.transform).toBe("matrix(1, 0, 0, 1, 0, -16)");
    expect(geometry.logoTopDelta).toBe(-16);
    expect(geometry.logoHeightDelta).toBe(0);
    expect(geometry.switcherTopDelta).toBe(0);
    expect(Math.abs(geometry.logoWidth - geometry.expectedLogoWidth)).toBeLessThan(0.1);
    expect(Math.abs(geometry.logoHeight - geometry.expectedLogoHeight)).toBeLessThan(0.1);
    expect(geometry.cardCoreGap).toBeGreaterThanOrEqual(8.98);
    expect(geometry.cardCoreGap).toBeLessThanOrEqual(12.02);
    expect(geometry.logoInsetLeft).toBeGreaterThanOrEqual(0);
    expect(geometry.logoInsetRight).toBeGreaterThanOrEqual(0);
    expect(geometry.horizontalOverflow).toBe(0);

    for (const [lottery, weight, size] of [["今彩539", "800", "20px"], ["天天樂", "800", "20px"], ["六合彩", "800", "13.5px"], ["大樂透", "700", "15px"]]) {
      await home.locator(`.lottery-switcher .lottery-card[data-lottery="${lottery}"]`).click();
      const digits = home.locator(`.latest-draw-card .number-ball-component[data-lottery="${lottery}"] .number-ball-value`);
      await expect(digits.first()).toHaveCSS("font-weight", weight);
      await expect(digits.first()).toHaveCSS("font-size", size);
      if (lottery === "今彩539" || lottery === "天天樂") {
        await page.evaluate(() => document.fonts.load('800 20px "Roboto Mark Six Home"', '0123456789'));
        expect(await page.evaluate(() => document.fonts.check('800 20px "Roboto Mark Six Home"', '0123456789'))).toBe(true);
      }
    }
    await home.locator('.lottery-switcher .lottery-card[data-lottery="今彩539"]').click();

    if (viewport.width === 390 && viewport.height === 844) {
      await page.screenshot({ path: testInfo.outputPath("homepage-390.png"), fullPage: true });
    }
  });
}
