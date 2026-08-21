import { expect, test } from "@playwright/test";

const pages = [
  { label: "Matrix 同星", screenSelector: ".tongxing-screen" },
  { label: "號碼對照單", screenSelector: ".number-reference-screen" },
] as const;

for (const width of [320, 360, 390, 430]) {
  test(`Matrix 同星與號碼對照單在 ${width}px 保持 12px 左右外距`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });

    for (const pageCase of pages) {
      await page.goto("/");
      await page.getByRole("button", { name: pageCase.label, exact: true }).click();

      const appViewport = page.getByTestId("mobile-scroll");
      const featureBody = page.locator(`${pageCase.screenSelector} .feature-body`);
      const titleBanner = page.locator(`${pageCase.screenSelector} .matrix-title-banner`);
      await expect(featureBody).toBeVisible();
      await expect(titleBanner).toBeVisible();

      const appBox = await appViewport.boundingBox();
      const bodyBox = await featureBody.boundingBox();
      const titleBox = await titleBanner.boundingBox();
      expect(appBox).not.toBeNull();
      expect(bodyBox).not.toBeNull();
      expect(titleBox).not.toBeNull();
      expect(appBox!.width).toBeCloseTo(width, 0);
      expect(bodyBox!.x - appBox!.x).toBeCloseTo(12, 0);
      expect(appBox!.x + appBox!.width - bodyBox!.x - bodyBox!.width).toBeCloseTo(12, 0);
      expect(titleBox!.x - appBox!.x).toBeCloseTo(12, 0);
      expect(appBox!.x + appBox!.width - titleBox!.x - titleBox!.width).toBeCloseTo(12, 0);
      expect(await featureBody.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);

      if (pageCase.label === "號碼對照單") {
        await page.getByRole("button", { name: "展開探索設定" }).click();
        const queryPanel = page.getByRole("dialog", { name: "探索設定" });
        await expect(queryPanel).toBeVisible();
        const queryBox = await queryPanel.boundingBox();
        expect(queryBox).not.toBeNull();
        expect(queryBox!.x - appBox!.x).toBeCloseTo(12, 0);
        expect(appBox!.x + appBox!.width - queryBox!.x - queryBox!.width).toBeCloseTo(12, 0);
        expect(await queryPanel.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
      }
    }
  });
}
