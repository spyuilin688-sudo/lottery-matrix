import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("app-mobile-canvas")).toBeVisible();
  await expect(page.getByTestId("bottom-navigation")).toBeVisible();
});

test("底部導覽全寬固定於內容畫布底部，保留四個可操作入口", async ({ page }) => {
  const mobilePage = page.locator(".mobile-page");
  const navigation = page.getByTestId("bottom-navigation");
  const labels = ["首頁", "快捷", "通知", "我的"];

  const mobilePageBox = await mobilePage.boundingBox();
  const navigationBox = await navigation.boundingBox();
  if (!mobilePageBox || !navigationBox) throw new Error("底部導覽沒有可量測的範圍");

  expect(await navigation.evaluate((element) => getComputedStyle(element).position)).toBe("fixed");
  expect(navigationBox.width).toBeCloseTo(mobilePageBox.width, 0);
  expect(navigationBox.height).toBeCloseTo(72, 0);
  expect(navigationBox.x).toBeCloseTo(mobilePageBox.x, 0);
  expect(navigationBox.y + navigationBox.height).toBeCloseTo(mobilePageBox.y + mobilePageBox.height, 0);

  const buttons = navigation.locator(".bottom-navigation-item");
  await expect(buttons).toHaveCount(4);

  for (const label of labels) {
    const button = navigation.getByRole("button", { name: label, exact: true });
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
  await expect(navigation).toHaveAttribute("data-active", "首頁");
  await expect(navigation.locator(".bottom-navigation-artwork")).toHaveAttribute(
    "src",
    "/assets/lottery/functions/matrixWW1.png",
  );

  await navigation.getByRole("button", { name: "通知" }).click();
  const notificationNavigation = page.getByTestId("bottom-navigation");
  await expect(notificationNavigation.getByRole("button", { name: "通知" })).toHaveAttribute("aria-current", "page");
  expect(await notificationNavigation.evaluate((element) => getComputedStyle(element).position)).toBe("fixed");

  const notificationPageBox = await page.locator(".mobile-page").boundingBox();
  const notificationNavigationBox = await notificationNavigation.boundingBox();
  if (!notificationPageBox || !notificationNavigationBox) throw new Error("通知頁底部導覽沒有可量測的範圍");
  expect(notificationNavigationBox.width).toBeCloseTo(notificationPageBox.width, 0);
  expect(notificationNavigationBox.x).toBeCloseTo(notificationPageBox.x, 0);
  expect(notificationNavigationBox.y + notificationNavigationBox.height).toBeCloseTo(notificationPageBox.y + notificationPageBox.height, 0);

  await notificationNavigation.getByRole("button", { name: "我的" }).click();
  await expect(page.getByTestId("bottom-navigation").getByRole("button", { name: "我的" })).toHaveAttribute("aria-current", "page");
});

test("Matrix 狀態右下角設定入口優先於我的點擊區並可進入自訂觸發條件", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("matrix-status-section").getByRole("button").first().click();

  const mobilePage = page.locator(".mobile-page");
  const navigation = page.getByTestId("bottom-navigation");
  const settings = page.getByRole("button", { name: "自訂觸發條件，連續點擊兩下開啟" });

  await expect(settings).toBeVisible();
  await expect(settings).toHaveCSS("position", "fixed");
  await expect(settings).toHaveCSS("right", "10px");
  await expect(settings).toHaveCSS("bottom", "9px");

  const mobilePageBox = await mobilePage.boundingBox();
  const settingsBox = await settings.boundingBox();
  if (!mobilePageBox || !settingsBox) throw new Error("Matrix 狀態設定入口沒有可量測的範圍");

  expect(settingsBox.x + settingsBox.width).toBeCloseTo(mobilePageBox.x + mobilePageBox.width - 10, 0);
  expect(settingsBox.y + settingsBox.height).toBeCloseTo(mobilePageBox.y + mobilePageBox.height - 9, 0);
  expect(await settings.evaluate((element) => {
    const box = element.getBoundingClientRect();
    const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
    return hit === element || element.contains(hit);
  })).toBe(true);
  expect(Number(await settings.evaluate((element) => getComputedStyle(element).zIndex)))
    .toBeGreaterThan(Number(await navigation.evaluate((element) => getComputedStyle(element).zIndex)));

  await settings.dblclick();
  await expect(page.getByRole("img", { name: "Matrix 自訂觸發狀態" })).toBeVisible();
  await expect(page.getByTestId("bottom-navigation").getByRole("button", { name: "我的" }))
    .not.toHaveAttribute("aria-current", "page");
});
