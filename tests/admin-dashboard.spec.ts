import { expect, test, type Page } from "@playwright/test";
import { describe } from "vitest";

const hasSupabasePublicConfig = Boolean(
  process.env.VITE_SUPABASE_URL?.trim() && process.env.VITE_SUPABASE_ANON_KEY?.trim(),
);
const adminEmail = process.env.E2E_ADMIN_EMAIL?.trim();
const adminPassword = process.env.E2E_ADMIN_PASSWORD;
const hasAdminCredentials = hasSupabasePublicConfig && Boolean(adminEmail && adminPassword);

async function signInAsAdmin(page: Page) {
  await page.goto("/admin");
  await page.locator('input[type="email"]').fill(adminEmail!);
  await page.locator('input[type="password"]').fill(adminPassword!);
  await page.getByRole("button", { name: "登入", exact: true }).click();
  await expect(page.getByTestId("admin-layout")).toBeVisible();
}

if (process.env.VITEST) {
  describe.skip("admin browser checks", () => {});
} else {
  test("unauthenticated admin route shows login", async ({ page }) => {
    test.skip(!hasSupabasePublicConfig, "requires deployment VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY");

    await page.goto("/admin");

    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
  });

  test("member home remains available", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByLabel("首頁彩種切換元件預覽")).toBeVisible();
  });

  test.describe("authenticated admin dashboard", () => {
    test.skip(!hasAdminCredentials, "requires deployment-only E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD");

    test("administrator can open all five admin sections", async ({ page }) => {
      await signInAsAdmin(page);

      const sections = [
        ["總覽", "dashboard"],
        ["會員管理", "members"],
        ["轉帳審核", "transfers"],
        ["付款紀錄", "payments"],
        ["啟動碼管理", "activation-codes"],
      ] as const;

      for (const [label, section] of sections) {
        await page.getByRole("button", { name: label, exact: true }).click();
        await expect(page.locator(".admin-content")).toHaveAttribute("data-section", section);
      }
    });

    test("390px mobile admin layout has no horizontal page overflow", async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await signInAsAdmin(page);

      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await expect(page.getByRole("navigation", { name: "後臺導覽" })).toBeVisible();
    });
  });
}
