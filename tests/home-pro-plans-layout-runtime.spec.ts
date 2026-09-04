import { expect, test } from "@playwright/test";

const MOBILE_WIDTHS = [360, 375, 390] as const;
const MOBILE_HEIGHT = 844;

for (const width of MOBILE_WIDTHS) {
  test(`首頁與訂閱方案在 ${width}px 使用正式間距 owner`, async ({ page }) => {
    await page.setViewportSize({ width, height: MOBILE_HEIGHT });
    await page.goto("/");

    const homepageTokens = await page.locator(".home-screen").evaluate((screen) => {
      const layout = getComputedStyle(screen.querySelector<HTMLElement>(".home-layout")!);
      const lotteryScreen = getComputedStyle(screen.querySelector<HTMLElement>(".lottery-screen")!);
      const brandHeader = getComputedStyle(screen.querySelector<HTMLElement>(".brand-header")!);
      return {
        logoSwitcher: lotteryScreen.getPropertyValue("--home-gap-logo-switcher").replaceAll(" ", ""),
        switcherDraw: lotteryScreen.getPropertyValue("--home-gap-switcher-draw").replaceAll(" ", ""),
        drawStatus: lotteryScreen.getPropertyValue("--home-gap-draw-status").replaceAll(" ", ""),
        featuresNav: layout.getPropertyValue("--home-gap-features-nav").replaceAll(" ", ""),
        headerTop: brandHeader.paddingTop,
      };
    });

    expect(homepageTokens).toEqual({
      logoSwitcher: "clamp(9px,calc(1.15dvh+1px),12px)",
      switcherDraw: "clamp(7px,calc(0.9dvh+1px),9px)",
      drawStatus: "clamp(9px,calc(1.15dvh+1px),12px)",
      featuresNav: "clamp(8px,1.15dvh,12px)",
      headerTop: "6px",
    });

    await page.getByTestId("bottom-navigation").getByRole("button", { name: "我的", exact: true }).click();
    await page.getByRole("button", { name: "訂閱方案／收費標準", exact: true }).click();

    const screen = page.locator(".pro-plans-screen");
    await expect(screen).toBeVisible();
    const currentCard = screen.locator('.plan-card[data-current="true"]').first();
    const checkout = screen.locator(".pro-plans-checkout");
    await expect(currentCard).toBeVisible();
    await expect(checkout).toBeVisible();

    await expect.poll(async () => screen.evaluate((root) => {
      const body = root.querySelector<HTMLElement>(":scope > .feature-body")!;
      const card = root.querySelector<HTMLElement>('.plan-card[data-current="true"]')!;
      const checkoutElement = root.querySelector<HTMLElement>(".pro-plans-checkout")!;
      const bodyRect = body.getBoundingClientRect();
      const cardRect = card.getBoundingClientRect();
      const checkoutRect = checkoutElement.getBoundingClientRect();
      return {
        cardLeft: Math.round(cardRect.left - bodyRect.left),
        cardRight: Math.round(bodyRect.right - cardRect.right),
        checkoutLeft: Math.round(checkoutRect.left - bodyRect.left),
        checkoutRight: Math.round(bodyRect.right - checkoutRect.right),
        overflow: document.documentElement.scrollWidth - window.innerWidth,
      };
    })).toEqual({
      cardLeft: 19,
      cardRight: 19,
      checkoutLeft: 16,
      checkoutRight: 16,
      overflow: 0,
    });
  });
}
