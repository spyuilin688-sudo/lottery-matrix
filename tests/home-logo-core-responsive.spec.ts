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
      return {
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
    expect(Math.abs(geometry.logoWidth - geometry.expectedLogoWidth)).toBeLessThan(0.1);
    expect(Math.abs(geometry.logoHeight - geometry.expectedLogoHeight)).toBeLessThan(0.1);
    expect(geometry.cardCoreGap).toBeGreaterThanOrEqual(8.98);
    expect(geometry.cardCoreGap).toBeLessThanOrEqual(12.02);
    expect(geometry.logoInsetLeft).toBeGreaterThanOrEqual(0);
    expect(geometry.logoInsetRight).toBeGreaterThanOrEqual(0);
    expect(geometry.horizontalOverflow).toBe(0);

    if (viewport.width === 390 && viewport.height === 844) {
      await page.screenshot({ path: testInfo.outputPath("homepage-390.png"), fullPage: true });
    }
  });
}
