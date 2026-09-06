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
      headerTop: "0px",
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
      const paymentElement = root.querySelector<HTMLElement>(".confirm-payment")!;
      const cards = Array.from(root.querySelectorAll<HTMLElement>(".plan-card"));
      const cardIndex = cards.indexOf(card);
      const previousCardRect = cards[cardIndex - 1]!.getBoundingClientRect();
      const nextCardRect = cards[cardIndex + 1]!.getBoundingClientRect();
      const bodyRect = body.getBoundingClientRect();
      const cardRect = card.getBoundingClientRect();
      const checkoutRect = checkoutElement.getBoundingClientRect();
      const hasOuterBoxShadow = (element: HTMLElement) => {
        const value = getComputedStyle(element).boxShadow;
        if (value === "none") return false;

        const shadows: string[] = [];
        let depth = 0;
        let start = 0;
        for (let index = 0; index < value.length; index += 1) {
          if (value[index] === "(") depth += 1;
          if (value[index] === ")") depth -= 1;
          if (value[index] === "," && depth === 0) {
            shadows.push(value.slice(start, index));
            start = index + 1;
          }
        }
        shadows.push(value.slice(start));
        return shadows.some((shadow) => !/\binset\b/.test(shadow));
      };
      return {
        cardLeft: Math.round(cardRect.left - bodyRect.left),
        cardRight: Math.round(bodyRect.right - cardRect.right),
        checkoutLeft: Math.round(checkoutRect.left - bodyRect.left),
        checkoutRight: Math.round(bodyRect.right - checkoutRect.right),
        planOuterShadow: hasOuterBoxShadow(card),
        paymentOuterShadow: hasOuterBoxShadow(paymentElement),
        previousCardPeek: Math.max(0, Math.round(previousCardRect.right - bodyRect.left)),
        nextCardPeek: Math.max(0, Math.round(bodyRect.right - nextCardRect.left)),
        overflow: document.documentElement.scrollWidth - window.innerWidth,
      };
    })).toEqual({
      // 25px carousel gutter plus half the 24px card reduction for neighbor peeks.
      cardLeft: 37,
      cardRight: 37,
      checkoutLeft: 16,
      checkoutRight: 16,
      planOuterShadow: false,
      paymentOuterShadow: false,
      previousCardPeek: 12,
      nextCardPeek: 12,
      overflow: 0,
    });
  });
}
