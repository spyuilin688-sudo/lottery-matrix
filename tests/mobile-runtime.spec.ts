import { expect, test, type Locator, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

const MOBILE_WIDTHS = [360, 375, 390] as const;
const MOBILE_HEIGHT = 844;
const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

async function expectNoHorizontalDocumentOverflow(page: Page) {
  await expect.poll(() => page.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth,
  )).toBe(true);
}

async function expectWithinViewport(page: Page, locator: Locator) {
  const box = await locator.boundingBox();
  const viewport = page.viewportSize();
  if (!box || !viewport) throw new Error("Viewport target has no measurable bounds");
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
}

async function touchDrag(
  page: Page,
  locator: Locator,
  deltaX: number,
  deltaY: number,
  steps = 6,
) {
  const box = await locator.boundingBox();
  if (!box) throw new Error("Touch target has no bounding box");
  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;
  const client = await page.context().newCDPSession(page);

  try {
    await client.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 1 });
    await client.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x: startX, y: startY, id: 1, radiusX: 1, radiusY: 1, force: 1 }],
    });
    for (let step = 1; step <= steps; step += 1) {
      await client.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{
          x: startX + (deltaX * step) / steps,
          y: startY + (deltaY * step) / steps,
          id: 1,
          radiusX: 1,
          radiusY: 1,
          force: 1,
        }],
      });
      await page.waitForTimeout(8);
    }
    await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  } finally {
    await client.send("Emulation.setTouchEmulationEnabled", { enabled: false });
    await client.detach();
  }
}

async function drag(page: Page, locator: Locator, deltaX: number, deltaY: number, steps = 8) {
  const box = await locator.boundingBox();
  if (!box) throw new Error("Drag target has no bounding box");
  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  for (let step = 1; step <= steps; step += 1) {
    await page.mouse.move(
      startX + (deltaX * step) / steps,
      startY + (deltaY * step) / steps,
    );
    await page.waitForTimeout(8);
  }
  await page.mouse.up();
}

test.beforeEach(async ({ page }) => {
  await page.goto("/tests/runtime-fixture.html");
});

for (const width of MOBILE_WIDTHS) {
  test(`Matrix ticket exposes pending failure and a decodable PNG retry at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: MOBILE_HEIGHT });
    const firstAssetFetchStarted = deferred();
    const releaseFirstAssetFetch = deferred();
    let ticketAssetFetches = 0;

    await page.route("**/assets/lottery/functions/matrixya.png", async (route) => {
      if (route.request().resourceType() !== "fetch") {
        await route.continue();
        return;
      }

      ticketAssetFetches += 1;
      if (ticketAssetFetches === 1) {
        firstAssetFetchStarted.resolve();
        await releaseFirstAssetFetch.promise;
        await route.fulfill({ status: 503, contentType: "text/plain", body: "unavailable" });
        return;
      }

      await route.continue();
    });

    await page.goto("/");
    await page.getByRole("button", { name: "Matrix 牌單", exact: true }).click();

    const button = page.getByRole("button", { name: "下載 PNG", exact: true });
    await expect(button).toBeVisible();
    await button.click();
    await firstAssetFetchStarted.promise;
    try {
      await expect(button).toBeDisabled();
      await expect(button).toHaveAttribute("aria-busy", "true");
    } finally {
      releaseFirstAssetFetch.resolve();
    }

    await expect(page.getByRole("alert")).toHaveText("下載失敗，請稍後再試");
    await expect(button).toBeEnabled();
    await expect(button).toHaveAttribute("aria-busy", "false");

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      button.click(),
    ]);
    expect(download.suggestedFilename()).toBe("matrix-ticket.png");
    const downloadPath = await download.path();
    expect(downloadPath).not.toBeNull();
    const bytes = await readFile(downloadPath!);
    expect(bytes.byteLength).toBeGreaterThan(PNG_SIGNATURE.length);
    expect(Array.from(bytes.subarray(0, PNG_SIGNATURE.length))).toEqual(PNG_SIGNATURE);

    const dimensions = await page.evaluate(async (source) => new Promise<{ width: number; height: number }>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
      image.onerror = () => reject(new Error("DOWNLOADED_PNG_DECODE_FAILED"));
      image.src = source;
    }), `data:image/png;base64,${bytes.toString("base64")}`);
    expect(dimensions.width).toBeGreaterThan(0);
    expect(dimensions.height).toBeGreaterThan(0);
    await expect(page.getByRole("alert")).toHaveCount(0);
    await expectNoHorizontalDocumentOverflow(page);
  });

  test(`invite and uncontracted actions remain explicit at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: MOBILE_HEIGHT });
    await page.goto("/");
    await page.getByTestId("bottom-navigation").getByRole("button", { name: "我的", exact: true }).click();
    await page.getByRole("button", { name: "我的推薦碼/啟動碼", exact: true }).click();

    const referral = page.locator(".referral-input-card");
    await expect(referral.getByRole("heading", { name: "輸入推薦碼", exact: true })).toBeVisible();
    await expect(referral.getByRole("button", { name: "確認", exact: true })).toBeDisabled();
    await page.getByRole("button", { name: "邀請好友", exact: true }).click();
    await expect(page.getByRole("heading", { name: "邀請好友", exact: true })).toBeVisible();
    await expect(page.getByText("推薦碼/邀請碼尚未提供。", { exact: true })).toBeVisible();
    await expectNoHorizontalDocumentOverflow(page);

    await page.goto("/tests/runtime-fixture.html?fixture=notes");
    await expect(page.getByRole("button", { name: "紀錄設定", exact: true })).toBeDisabled();
    await expectNoHorizontalDocumentOverflow(page);
  });

  test(`product textareas and standards scrollbars retain geometry at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: MOBILE_HEIGHT });
    await page.evaluate(() => window.localStorage.setItem("matrix-quick-target", "notebook"));
    await page.goto("/");
    await page.getByTestId("bottom-navigation").getByRole("button", { name: /^快捷/ }).click();
    await page.getByRole("button", { name: "新增筆記", exact: true }).click();

    const notebook = page.getByLabel("筆記內容", { exact: true });
    await expect(notebook).toBeVisible();
    const notebookGeometry = await notebook.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        resize: style.resize,
        height: Number.parseFloat(style.height),
        minHeight: Number.parseFloat(style.minHeight),
      };
    });
    expect(notebookGeometry.resize).toBe("none");
    expect(notebookGeometry.minHeight).toBe(330);
    expect(notebookGeometry.height).toBeGreaterThanOrEqual(330);

    const scrollbars = await page.evaluate(() => {
      const probe = document.createElement("div");
      probe.style.cssText = "width:20px;height:20px;overflow:auto";
      const content = document.createElement("div");
      content.style.cssText = "width:40px;height:40px";
      probe.append(content);
      document.body.append(probe);
      const root = getComputedStyle(document.documentElement);
      const inherited = getComputedStyle(probe);
      const values = {
        rootColor: root.getPropertyValue("scrollbar-color"),
        rootWidth: root.getPropertyValue("scrollbar-width"),
        inheritedColor: inherited.getPropertyValue("scrollbar-color"),
        inheritedWidth: inherited.getPropertyValue("scrollbar-width"),
      };
      probe.remove();
      return values;
    });
    expect(scrollbars).toEqual({
      rootColor: "rgb(229, 179, 77) rgb(4, 10, 17)",
      rootWidth: "thin",
      inheritedColor: "rgb(229, 179, 77) rgb(4, 10, 17)",
      inheritedWidth: "thin",
    });
    await expectNoHorizontalDocumentOverflow(page);

    await page.goto("/tests/runtime-fixture.html?fixture=textarea");
    const runtimeTextarea = page.getByLabel("Runtime note", { exact: true });
    await expect(runtimeTextarea).toHaveClass(/\bmobile-textarea-resize-none\b/);
    const runtimeGeometry = await runtimeTextarea.evaluate((element) => {
      const style = getComputedStyle(element);
      return { resize: style.resize, height: style.height, minHeight: style.minHeight };
    });
    expect(runtimeGeometry).toEqual({ resize: "none", height: "91px", minHeight: "73px" });
    await expectNoHorizontalDocumentOverflow(page);
  });

  test(`native scrolling accepts wheel keyboard and touch input at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: MOBILE_HEIGHT });
    await page.goto("/tests/runtime-fixture.html");
    const carousel = page.locator(".fixture-carousel");
    const cards = page.locator(".carousel-card");
    const vertical = page.getByTestId("mobile-scroll");

    const behavior = await page.evaluate(() => {
      const horizontal = getComputedStyle(document.querySelector<HTMLElement>(".fixture-carousel")!);
      const scroll = getComputedStyle(document.querySelector<HTMLElement>('[data-testid="mobile-scroll"]')!);
      return {
        horizontalOverflow: horizontal.overflowX,
        horizontalTouch: horizontal.touchAction,
        horizontalOverscroll: horizontal.overscrollBehavior,
        verticalOverflow: scroll.overflowY,
        verticalTouch: scroll.touchAction,
        verticalOverscroll: scroll.overscrollBehavior,
      };
    });
    expect(behavior).toEqual({
      horizontalOverflow: "auto",
      horizontalTouch: "pan-y",
      horizontalOverscroll: "contain",
      verticalOverflow: "auto",
      verticalTouch: "pan-y",
      verticalOverscroll: "contain",
    });

    await carousel.hover();
    await page.mouse.wheel(180, 0);
    await expect.poll(() => carousel.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);

    await carousel.evaluate((element) => { element.scrollLeft = 0; });
    await cards.first().focus();
    for (let index = 1; index < 7; index += 1) await page.keyboard.press("Tab");
    await expect(cards.last()).toBeFocused();
    await expect.poll(() => carousel.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);

    await carousel.evaluate((element) => { element.scrollLeft = 0; });
    await touchDrag(page, carousel, -100, 4);
    await expect.poll(() => carousel.evaluate((element) => element.scrollLeft)).toBeGreaterThan(20);

    await vertical.evaluate((element) => { element.scrollTop = 0; });
    await vertical.hover();
    await page.mouse.wheel(0, 260);
    await expect.poll(() => vertical.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);

    await vertical.evaluate((element) => { element.scrollTop = 0; });
    await page.locator(".sheet-trigger").focus();
    await page.keyboard.press("PageDown");
    await expect.poll(() => vertical.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);

    await vertical.evaluate((element) => { element.scrollTop = 0; });
    await touchDrag(page, vertical, 0, -140);
    await expect.poll(() => vertical.evaluate((element) => element.scrollTop)).toBeGreaterThan(20);
    await expectNoHorizontalDocumentOverflow(page);
  });

}

test("horizontal intent stays in Carousel and cannot create parent momentum", async ({ page }) => {
  const carousel = page.locator(".fixture-carousel");
  const card = page.locator(".carousel-card").nth(1);
  const parent = page.getByTestId("mobile-scroll");

  await expect(carousel).not.toHaveAttribute("data-scroll-drag", "ignore");
  await drag(page, card, -130, 14, 5);

  const afterRelease = await carousel.evaluate((element) => element.scrollLeft);
  expect(afterRelease).toBeGreaterThan(40);
  expect(await parent.evaluate((element) => element.scrollTop)).toBe(0);

  await page.waitForTimeout(250);
  expect(await parent.evaluate((element) => element.scrollTop)).toBe(0);
  expect(await page.getByTestId("tap-count").textContent()).toBe("0");
});

test("vertical intent over a carousel is handed to MobileScroll in both directions", async ({ page }) => {
  const card = page.locator(".carousel-card").nth(1);
  const carousel = page.locator(".fixture-carousel");
  const parent = page.getByTestId("mobile-scroll");

  await drag(page, card, 4, -150);
  expect(await parent.evaluate((element) => element.scrollTop)).toBeGreaterThan(60);
  expect(await carousel.evaluate((element) => element.scrollLeft)).toBe(0);

  await parent.evaluate((element) => {
    element.scrollTop = 80;
  });
  await drag(page, card, -3, 110);
  expect(await parent.evaluate((element) => element.scrollTop)).toBeLessThan(80);
});

test("tap activates a card but a completed drag does not", async ({ page }) => {
  const firstCard = page.locator(".carousel-card").first();
  await firstCard.click();
  await expect(page.getByTestId("tap-count")).toHaveText("1");

  await drag(page, firstCard, -100, 6);
  await expect(page.getByTestId("tap-count")).toHaveText("1");
});

test("Carousel preserves momentum and edge rubber-banding", async ({ page }) => {
  const carousel = page.locator(".fixture-carousel");
  const card = page.locator(".carousel-card").nth(1);

  await drag(page, card, -100, 5, 3);
  const releasedOffset = await carousel.evaluate((element) => element.scrollLeft);
  await page.waitForTimeout(120);
  expect(await carousel.evaluate((element) => element.scrollLeft)).toBeGreaterThan(releasedOffset);

  await carousel.evaluate((element) => {
    element.scrollLeft = 0;
  });
  const box = await card.boundingBox();
  if (!box) throw new Error("Card has no bounding box");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 90, box.y + box.height / 2, { steps: 4 });
  expect(Number(await carousel.getAttribute("data-overscroll"))).toBeGreaterThan(0);
  await page.mouse.up();
  await page.waitForTimeout(900);
  expect(Math.abs(Number(await carousel.getAttribute("data-overscroll")))).toBeLessThan(1);
});

test("BottomSheet remains mounted while its default exit animation plays", async ({ page }) => {
  await page.locator(".sheet-trigger").click();
  await expect(page.getByTestId("bottom-sheet")).toBeVisible();

  await page.getByTestId("sheet-overlay").click({ position: { x: 8, y: 8 } });
  await expect(page.getByTestId("bottom-sheet")).toHaveCount(1);
  await page.waitForTimeout(500);
  await expect(page.getByTestId("bottom-sheet")).toHaveCount(0);
});

test("keyboard and its attached footer dismiss on the same transition", async ({ page }) => {
  await page.goto("/tests/runtime-fixture.html?fixture=keyboard");
  const input = page.getByLabel("Message");
  const footer = page.getByTestId("flow-fixed-footer");
  const keyboard = page.getByTestId("keyboard-dock");

  await input.click();
  await expect(keyboard).toHaveAttribute("data-visible", "true");
  await drag(page, footer, 0, 120, 5);
  await expect(keyboard).toHaveAttribute("data-visible", "false");

  await page.waitForTimeout(100);
  const progress = await page.evaluate(() => {
    const footerElement = document.querySelector<HTMLElement>('[data-testid="flow-fixed-footer"]')!;
    const keyboardElement = document.querySelector<HTMLElement>('[data-testid="keyboard-dock"]')!;
    const fullHeight = Number.parseFloat(keyboardElement.style.height);
    const footerRemaining = Number.parseFloat(getComputedStyle(footerElement).bottom);
    const matrix = new DOMMatrixReadOnly(getComputedStyle(keyboardElement).transform);
    return {
      footer: footerRemaining / fullHeight,
      keyboard: 1 - matrix.m42 / fullHeight,
    };
  });
  expect(Math.abs(progress.footer - progress.keyboard)).toBeLessThan(0.18);

  await page.waitForTimeout(300);
  expect(await footer.evaluate((element) => getComputedStyle(element).bottom)).toBe("34px");
});

test("switching to Pixel keeps the composer above Android navigation", async ({ page }) => {
  await page.goto("/tests/runtime-fixture.html?fixture=keyboard");
  const input = page.getByLabel("Message");
  await input.evaluate((element: HTMLInputElement) => {
    element.value = "Draft message";
  });

  await page.getByTestId("device-picker").click();
  await page.getByTestId("device-option-pixel-10").click();

  const frame = page.getByTestId("phone-frame");
  const screen = page.getByTestId("device-screen");
  const statusIndicators = page.getByTestId("status-indicators");
  const navigation = page.getByTestId("android-navigation-bar");
  const footer = page.getByTestId("flow-fixed-footer");

  await expect(frame).toHaveAttribute("data-device", "pixel-10");
  await expect(screen).toHaveAttribute("data-device", "pixel-10");
  await expect(page.locator(".phone-bezel")).toHaveAttribute(
    "src",
    "/assets/android/Pixel10.png",
  );
  await expect(statusIndicators).toHaveAttribute("data-platform", "android");
  await expect(statusIndicators).toHaveAttribute(
    "src",
    "/assets/status/status-icons.svg",
  );
  await expect(navigation).toBeVisible();
  await expect(page.getByTestId("home-indicator")).toHaveCount(0);
  await expect(input).toHaveValue("Draft message");
  await page.waitForTimeout(300);

  const layout = await page.evaluate(() => {
    const footerElement = document.querySelector<HTMLElement>(
      '[data-testid="flow-fixed-footer"]',
    )!;
    const navigationElement = document.querySelector<HTMLElement>(
      '[data-testid="android-navigation-bar"]',
    )!;
    const appViewportElement = document.querySelector<HTMLElement>(
      '[data-testid="mobile-app-viewport"]',
    )!;
    return {
      footerBottom: footerElement.getBoundingClientRect().bottom,
      appViewportBottom: appViewportElement.getBoundingClientRect().bottom,
      navigationTop: navigationElement.getBoundingClientRect().top,
      navigationHeight: Number.parseFloat(getComputedStyle(navigationElement).height),
      safeAreaBottom: Number.parseFloat(
        getComputedStyle(document.querySelector<HTMLElement>('[data-testid="device-screen"]')!).getPropertyValue(
          "--device-safe-area-bottom",
        ),
      ),
    };
  });

  expect(layout.safeAreaBottom).toBe(layout.navigationHeight);
  expect(Math.abs(layout.appViewportBottom - layout.navigationTop)).toBeLessThanOrEqual(1);
  expect(Math.abs(layout.footerBottom - layout.navigationTop)).toBeLessThanOrEqual(1);

  await input.click();
  await expect(page.getByTestId("keyboard-dock")).toHaveAttribute("data-visible", "true");
  await expect(navigation).toHaveCount(0);
  await page.waitForTimeout(300);

  const keyboardLayout = await page.evaluate(() => {
    const screen = document.querySelector<HTMLElement>('[data-testid="device-screen"]')!;
    const viewport = document.querySelector<HTMLElement>('[data-testid="mobile-app-viewport"]')!;
    const scroll = document.querySelector<HTMLElement>('[data-testid="mobile-scroll"]')!;
    const footerElement = document.querySelector<HTMLElement>('[data-testid="flow-fixed-footer"]')!;
    const keyboard = document.querySelector<HTMLElement>('[data-testid="keyboard-dock"]')!;

    return {
      screenBottom: screen.getBoundingClientRect().bottom,
      viewportBottom: viewport.getBoundingClientRect().bottom,
      scrollBottom: scroll.getBoundingClientRect().bottom,
      footerBottom: footerElement.getBoundingClientRect().bottom,
      keyboardTop: keyboard.getBoundingClientRect().top,
      keyboardBottom: keyboard.getBoundingClientRect().bottom,
    };
  });

  expect(keyboardLayout.viewportBottom).toBeCloseTo(keyboardLayout.screenBottom, 0);
  expect(Math.abs(keyboardLayout.keyboardBottom - keyboardLayout.screenBottom)).toBeLessThanOrEqual(1);
  expect(Math.abs(keyboardLayout.scrollBottom - keyboardLayout.keyboardTop)).toBeLessThanOrEqual(1);
  expect(Math.abs(keyboardLayout.footerBottom - keyboardLayout.keyboardTop)).toBeLessThanOrEqual(1);
});

test("FlowStack pushes and pops screens while dismissing the keyboard", async ({ page }) => {
  await page.goto("/tests/runtime-fixture.html?fixture=flow");
  await page.getByLabel("Flow message").click();
  await expect(page.getByTestId("keyboard-dock")).toHaveAttribute("data-visible", "true");

  await page.getByRole("button", { name: "Push level 2" }).click();
  await expect(page.getByRole("heading", { name: "Screen stacking works" })).toBeVisible();
  await expect(page.getByTestId("keyboard-dock")).toHaveAttribute("data-visible", "false");
  const safeHeaderPlacement = await page.evaluate(() => {
    const screen = document.querySelector<HTMLElement>('[data-testid="device-screen"]')!;
    const toolbar = document.querySelector<HTMLElement>(".flow-fixture-header")!;
    return toolbar.getBoundingClientRect().top - screen.getBoundingClientRect().top;
  });
  expect(safeHeaderPlacement).toBeGreaterThanOrEqual(54);

  await page.getByRole("button", { name: "Push level 3" }).click();
  await expect(page.getByRole("heading", { name: "Nested view level 3" })).toBeVisible();
  await page.getByRole("button", { name: "Push level 4" }).click();
  await expect(page.getByRole("heading", { name: "Nested view level 4" })).toBeVisible();

  await page.getByRole("button", { name: "Done" }).click();
  await expect(page.getByRole("heading", { name: "Nested view level 3" })).toBeVisible();
  await page.getByRole("button", { name: "‹ Back" }).click();
  await expect(page.getByRole("heading", { name: "Screen stacking works" })).toBeVisible();
  await page.getByRole("button", { name: "Done" }).click();
  await expect(page.getByRole("heading", { name: "Flow root" })).toBeVisible();
});
