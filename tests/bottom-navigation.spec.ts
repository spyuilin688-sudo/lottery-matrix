import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("device-screen")).toHaveAttribute("data-device", "pixel-10");
  await expect(page.getByTestId("bottom-navigation")).toBeVisible();
});

test("底部導覽以參考圖比例置中，保留四個可操作入口", async ({ page }) => {
  const screen = page.getByTestId("device-screen");
  const navigation = page.getByTestId("bottom-navigation");
  const labels = ["首頁", "快捷", "通知", "我的"];

  const screenBox = await screen.boundingBox();
  const navigationBox = await navigation.boundingBox();
  if (!screenBox || !navigationBox) throw new Error("底部導覽沒有可量測的範圍");

  expect(navigationBox.width).toBeCloseTo(382, 0);
  expect(navigationBox.height).toBeCloseTo(93, 0);
  expect(navigationBox.x - screenBox.x).toBeCloseTo((screenBox.width - navigationBox.width) / 2, 0);

  const buttons = navigation.getByRole("button");
  await expect(buttons).toHaveCount(4);

  for (const label of labels) {
    const button = navigation.getByRole("button", { name: new RegExp(`^${label}`) });
    const box = await button.boundingBox();
    if (!box) throw new Error(`${label}沒有可量測的點擊範圍`);
    expect(box.width).toBeGreaterThanOrEqual(48);
    expect(box.height).toBeGreaterThanOrEqual(48);
  }
});

test("選取狀態會跟隨首頁、通知與我的頁面", async ({ page }) => {
  const navigation = page.getByTestId("bottom-navigation");
  const home = navigation.getByRole("button", { name: "首頁" });

  await expect(home).toHaveAttribute("aria-current", "page");
  await expect(home.locator(".bottom-navigation-active-bar")).toHaveCSS("width", "16px");

  await navigation.getByRole("button", { name: "通知" }).click();
  await expect(page.getByTestId("bottom-navigation").getByRole("button", { name: "通知" })).toHaveAttribute("aria-current", "page");

  await page.getByTestId("bottom-navigation").getByRole("button", { name: "我的" }).click();
  await expect(page.getByTestId("bottom-navigation").getByRole("button", { name: "我的" })).toHaveAttribute("aria-current", "page");
});
