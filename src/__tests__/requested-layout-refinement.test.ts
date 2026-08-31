// @vitest-environment jsdom

// @ts-expect-error Vitest runs on Node; this project intentionally omits global Node types from app compilation.
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";

declare const process: { cwd(): string };

const readCss = (path: string) => readFileSync(`${process.cwd()}/${path}`, "utf8");

function mountStyles(css: string) {
  const style = document.createElement("style");
  style.textContent = css;
  document.head.append(style);
  return style;
}

afterEach(() => {
  document.head.querySelectorAll("style[data-layout-contract]").forEach((style) => style.remove());
  document.body.innerHTML = "";
});

describe("requested responsive layout refinement", () => {
  it("keeps the homepage sections on their requested independent inline gutters", () => {
    const style = mountStyles(`${readCss("src/homepage/base.css")}\n${readCss("src/homepage/lottery-switcher.css")}`);
    style.dataset.layoutContract = "homepage";
    document.body.innerHTML = `
      <div class="home-screen">
        <div class="lottery-screen">
          <div class="lottery-switcher lottery-switcher--home-style"></div>
          <section class="latest-draw-card"></section>
          <section class="matrix-status-section"></section>
        </div>
        <div class="home-bottom-group">
          <button class="matrix-core-banner"></button>
          <div class="home-shortcut-row"></div>
        </div>
      </div>`;

    expect(getComputedStyle(document.querySelector(".lottery-switcher")!).paddingInline).toBe("4px");
    expect(getComputedStyle(document.querySelector(".lottery-screen")!).getPropertyValue("--layout-page-inline")).toBe("16px");
    expect(getComputedStyle(document.querySelector(".latest-draw-card")!).width).toBe("calc(100% - 32px)");
    expect(getComputedStyle(document.querySelector(".matrix-status-section")!).width).toBe("calc(100% - 32px)");
    expect(getComputedStyle(document.querySelector(".home-bottom-group")!).getPropertyValue("--home-core-width")).toContain("28px");
    expect(getComputedStyle(document.querySelector(".home-shortcut-row")!).width).toBe("100%");
  });

  it("keeps the current draw-card placement contracts", () => {
    const style = mountStyles(readCss("src/homepage/base.css"));
    style.dataset.layoutContract = "draw-card";
    document.body.innerHTML = `
      <div class="home-screen"><section class="latest-draw-card">
        <div class="draw-meta"></div>
        <div class="draw-order"></div>
        <button class="history-link"></button>
        <div class="draw-balls"></div>
        <div class="next-draw-info--embedded"></div>
      </section></div>`;

    expect(getComputedStyle(document.querySelector(".latest-draw-card")!).gridTemplateRows).toBe("44px minmax(0, 1fr) 24px");
    expect(getComputedStyle(document.querySelector(".draw-meta")!).transform).toBe("translateY(-8px)");
    expect(getComputedStyle(document.querySelector(".draw-order")!).transform).toBe("none");
    expect(getComputedStyle(document.querySelector(".history-link")!).transform).toBe("translate(-10px, -16px)");
    expect(getComputedStyle(document.querySelector(".draw-balls")!).transform).toBe("none");
    expect(getComputedStyle(document.querySelector(".next-draw-info--embedded")!).transform).toBe("none");
  });

  it("uses Matrix Explore density for Tianyan and Tiangong controls", () => {
    const style = mountStyles(`${readCss("src/feature-pages.css")}\n${readCss("src/matrix-explore-spacing.css")}`);
    style.dataset.layoutContract = "matrix";
    document.body.innerHTML = `
      <main class="matrix-explore-screen matrix-explore-main-screen matrix-explore-layout matrix-tianyan-screen">
        <header class="matrix-title-banner-actions"><nav class="matrix-page-switcher"></nav></header>
        <section class="explore-settings"><div class="setting-grid"><label><span></span><div class="select-box"></div></label></div></section>
      </main>
      <main class="matrix-explore-screen matrix-explore-main-screen matrix-explore-layout matrix-tiangong-screen">
        <section class="explore-settings tiangong-settings"><div class="setting-grid"><div class="tiangong-setting-row"><span>探索球位</span><div class="segmented three"><button></button></div></div></div></section>
        <section class="result-panel"><div class="road-results tiangong-results"><div class="tiangong-results-head"><span>間距期數</span><span>預測位置</span><span>預測</span><span>版路類型</span></div></div></section>
      </main>`;

    expect(getComputedStyle(document.querySelector(".matrix-page-switcher")!).width).toBe("2.34rem");
    expect(getComputedStyle(document.querySelector(".matrix-page-switcher")!).overflowY).toBe("auto");
    expect(getComputedStyle(document.querySelector(".matrix-tianyan-screen .select-box")!).height).toBe("24px");
    expect(getComputedStyle(document.querySelector(".matrix-tiangong-screen .tiangong-setting-row")!).gridTemplateColumns).toBe("var(--tiangong-label-column) minmax(0, 1fr)");
    expect(getComputedStyle(document.querySelector(".matrix-tiangong-screen .tiangong-setting-row button")!).height).toBe("24px");
    expect(getComputedStyle(document.querySelector(".matrix-tiangong-screen .tiangong-results-head")!).gridTemplateColumns).toBe("minmax(0, 1fr) minmax(0, 1fr) minmax(0, .8fr) minmax(0, 1.25fr)");
  });

  it("uses eight-pixel profile rhythm and six-pixel card top padding", () => {
    const style = mountStyles(`${readCss("src/feature-pages.css")}\n${readCss("src/pro-plans-carousel-peek.css")}`);
    style.dataset.layoutContract = "profile";
    document.body.innerHTML = `
      <main class="profile-screen"><div class="feature-body">
        <section class="panel profile-card"></section>
        <section class="panel subscription-status-card"></section>
        <section class="panel profile-menu"></section>
      </div></main>`;

    expect(getComputedStyle(document.querySelector(".profile-screen .feature-body")!).gap).toBe("8px");
    expect(getComputedStyle(document.querySelector(".profile-card")!).paddingTop).toBe("6px");
    expect(getComputedStyle(document.querySelector(".subscription-status-card")!).paddingTop).toBe("6px");
    expect(getComputedStyle(document.querySelector(".profile-menu")!).paddingTop).toBe("6px");
  });

  it("aligns activation and membership-plan cards with their title cards", () => {
    const style = mountStyles(readCss("src/feature-pages.css"));
    style.dataset.layoutContract = "profile-details";
    document.body.innerHTML = `
      <main class="activation-code-screen"><div class="feature-body"><section class="panel referral-summary-card"></section></div></main>
      <main class="pro-plans-screen"><div class="feature-body"><div class="plan-carousel"><section class="plan-card"></section></div><section class="renewal-card"></section></div></main>`;

    expect(getComputedStyle(document.querySelector(".activation-code-screen .panel")!).width).toBe("100%");
    expect(getComputedStyle(document.querySelector(".referral-summary-card")!).padding).toBe("0px");
    expect(getComputedStyle(document.querySelector(".pro-plans-screen .plan-carousel")!).margin).toBe("0px");
    expect(getComputedStyle(document.querySelector(".pro-plans-screen .plan-carousel")!).paddingLeft).toBe("0px");
    expect(readCss("src/pro-plans-carousel-peek.css")).toMatch(/\.pro-plans-screen \.plan-card\s*\{[^}]*flex-basis:\s*calc\(100% - 36px\);/s);
    expect(getComputedStyle(document.querySelector(".pro-plans-screen .plan-card")!).minHeight).toBe("202px");
    expect(getComputedStyle(document.querySelector(".pro-plans-screen .plan-card")!).padding).toBe("12px");
    expect(getComputedStyle(document.querySelector(".pro-plans-screen .renewal-card")!).width).toBe("100%");
  });

  it("uses the branded explore action on the membership-plan payment button", () => {
    const style = mountStyles(readCss("src/feature-pages.css"));
    style.dataset.layoutContract = "profile-actions";
    document.body.innerHTML = `
      <main class="activation-code-screen"><section class="activation-card"><button class="gold-button"></button></section></main>
      <main class="pro-plans-screen"><button class="primary-action branded-explore-action confirm-payment"><span>確定付款</span></button></main>`;

    const activationButton = getComputedStyle(document.querySelector(".activation-code-screen .gold-button")!);
    const paymentButton = getComputedStyle(document.querySelector(".pro-plans-screen .confirm-payment")!);
    expect(activationButton.height).toBe("44px");
    expect(activationButton.backgroundColor).toBe("rgb(6, 13, 18)");
    expect(activationButton.borderTopWidth).toBe("1px");
    expect(paymentButton.height).toBe("42px");
    expect(paymentButton.getPropertyValue("--payment-button-font-size")).toBe("clamp(15px,4.4vw,17px)");
    expect(paymentButton.position).toBe("relative");
    expect(paymentButton.overflow).toBe("hidden");
    expect(paymentButton.color).toBe("rgb(246, 212, 114)");
    expect(paymentButton.borderTopWidth).toBe("1px");
  });

  it("keeps the membership checkout in responsive flow with the requested spacing", () => {
    const style = mountStyles(readCss("src/feature-pages.css"));
    style.dataset.layoutContract = "membership-checkout-spacing";
    document.body.innerHTML = `
      <main class="pro-plans-screen"><div class="feature-body">
        <div class="plan-carousel"></div>
        <div class="pro-plans-checkout">
          <section class="panel renewal-card"></section>
          <button class="primary-action branded-explore-action confirm-payment"><span>確定付款</span></button>
          <p class="payment-note">點擊 確定付款 將跳轉付款頁面</p>
        </div>
      </div></main>`;

    const checkout = getComputedStyle(document.querySelector(".pro-plans-checkout")!);
    const renewalCard = getComputedStyle(document.querySelector(".renewal-card")!);
    const paymentButton = getComputedStyle(document.querySelector(".confirm-payment")!);
    const paymentNote = getComputedStyle(document.querySelector(".payment-note")!);

    expect(getComputedStyle(document.querySelector(".pro-plans-screen .feature-body")!).gap).toBe("8px");
    expect(checkout.display).toBe("grid");
    expect(checkout.rowGap).toBe("5px");
    expect(checkout.marginLeft).toBe("4px");
    expect(checkout.marginRight).toBe("4px");
    expect(renewalCard.width).toBe("100%");
    expect(paymentButton.width).toBe("100%");
    expect(paymentNote.marginTop).toBe("0px");
  });

  it("separates membership plan hierarchy and removes tool icon frames", () => {
    const style = mountStyles(readCss("src/feature-pages.css"));
    style.dataset.layoutContract = "pro-plan-visual-hierarchy";
    document.body.innerHTML = `
      <main class="pro-plans-screen">
        <article class="plan-card" data-current="true">
          <span class="plan-name">季費方案</span>
          <strong>$4,580</strong>
          <span class="plan-tool-icon"><img alt="天衍" /></span>
        </article>
        <section class="panel renewal-card"></section>
      </main>`;

    const planCard = getComputedStyle(document.querySelector(".plan-card")!);
    const planName = getComputedStyle(document.querySelector(".plan-name")!);
    const planPrice = getComputedStyle(document.querySelector(".plan-card > strong")!);
    const toolIcon = getComputedStyle(document.querySelector(".plan-tool-icon")!);
    const renewalCard = getComputedStyle(document.querySelector(".renewal-card")!);

    expect(planName.color).toBe("rgb(236, 231, 223)");
    expect(planPrice.color).toBe("rgb(241, 195, 82)");
    expect(toolIcon.borderTopWidth).toBe("0px");
    expect(toolIcon.boxShadow).toBe("none");
    expect(renewalCard.borderTopColor).toBe(planCard.borderTopColor);
    expect(renewalCard.borderRadius).toBe(planCard.borderRadius);
    expect(renewalCard.boxShadow).toBe(planCard.boxShadow);
  });

  it("compacts payment history without changing its two-column information order", () => {
    const style = mountStyles(readCss("src/feature-pages.css"));
    style.dataset.layoutContract = "payment-history-density";
    document.body.innerHTML = `
      <main class="payment-history-screen">
        <section class="panel detail-card">
          <h2>付款紀錄</h2>
          <div class="payment-history-list">
            <article class="payment-history-item">
              <strong>月費方案</strong><span>NT$1,880</span>
              <time>2026/8/30 上午6:51:44</time><b>已確認</b>
            </article>
          </div>
        </section>
      </main>`;

    const card = getComputedStyle(document.querySelector(".payment-history-screen .detail-card")!);
    const heading = getComputedStyle(document.querySelector(".payment-history-screen .detail-card h2")!);
    const item = getComputedStyle(document.querySelector(".payment-history-item")!);
    const name = getComputedStyle(document.querySelector(".payment-history-item strong")!);
    const amount = getComputedStyle(document.querySelector(".payment-history-item > span")!);
    const date = getComputedStyle(document.querySelector(".payment-history-item time")!);
    const status = getComputedStyle(document.querySelector(".payment-history-item b")!);

    expect(card.padding).toBe("10px");
    expect(heading.marginBottom).toBe("6px");
    expect(heading.fontSize).toBe("15px");
    expect(item.gridTemplateColumns).toBe("minmax(0, 1fr) auto");
    expect(item.padding).toBe("7px 9px");
    expect(item.rowGap).toBe("2px");
    expect(name.fontSize).toBe("13px");
    expect(amount.fontSize).toBe("13px");
    expect(date.fontSize).toBe("11px");
    expect(status.fontSize).toBe("13px");
  });

  it("keeps notification bulk actions equal-width, fluid, and touch-sized", () => {
    const adjustmentCss = readCss("src/feature-page-adjustments.css");
    const style = mountStyles(`${readCss("src/design-tokens.css")}\n${readCss("src/feature-pages.css")}\n${adjustmentCss}`);
    style.dataset.layoutContract = "notification-bulk-actions";
    document.body.innerHTML = `
      <main class="notifications-screen notifications-screen-v2">
        <div class="feature-body">
          <div class="notification-content">
            <div class="notification-bulk-actions">
              <button class="notification-bulk-enable">全部開啟</button>
              <button class="notification-bulk-disable">全部關閉</button>
            </div>
            <div class="notification-list"><section class="notification-group"></section></div>
          </div>
        </div>
      </main>`;

    const content = getComputedStyle(document.querySelector(".notification-content")!);
    const actions = getComputedStyle(document.querySelector(".notification-bulk-actions")!);
    const enable = getComputedStyle(document.querySelector(".notification-bulk-enable")!);
    const disable = getComputedStyle(document.querySelector(".notification-bulk-disable")!);
    expect(content.rowGap).toBe("16px");
    expect(actions.display).toBe("grid");
    expect(actions.gridTemplateColumns).toBe("repeat(2, minmax(0, 1fr))");
    expect(actions.columnGap).toBe("8px");
    expect(enable.height).toBe("32px");
    expect(disable.height).toBe("32px");
    expect(enable.width).toBe("100%");
    expect(disable.width).toBe("100%");
    expect(adjustmentCss).not.toMatch(/\.notification-bulk-enable\s*\{[^}]*background:\s*var\(--lottery-gold-500\)/s);
    expect(adjustmentCss).toMatch(/\.notification-bulk-disable\s*\{[^}]*background:\s*linear-gradient/s);
    expect(adjustmentCss).toMatch(/\.notification-bulk-disable\s*\{[^}]*border:\s*1px solid var\(--lottery-gold-500\)/s);
  });

  it("reduces the system notification explanation without changing the title", () => {
    const style = mountStyles(`${readCss("src/design-tokens.css")}\n${readCss("src/feature-page-adjustments.css")}`);
    style.dataset.layoutContract = "notification-system-description";
    document.body.innerHTML = `<main class="notifications-screen-v2"><p class="notification-push-status">維護、更新</p></main>`;

    expect(getComputedStyle(document.querySelector(".notification-push-status")!).fontSize).toBe("10px");
  });

  it("tightens guide summary and bullet spacing without changing the existing type size", () => {
    const style = mountStyles(`${readCss("src/feature-pages.css")}\n${readCss("src/feature-page-adjustments.css")}`);
    style.dataset.layoutContract = "guide-reading-rhythm";
    document.body.innerHTML = `
      <main class="matrix-guide-screen">
        <nav class="guide-category-strip">
          <button class="guide-category-card">01 未選中</button>
          <button class="guide-category-card" data-selected="true">02 選中</button>
        </nav>
        <section class="guide-preview">
          <p class="guide-summary">說明文字</p>
          <section class="guide-detail-block"><ul><li>這是一段會折行的條列內容</li></ul></section>
        </section>
      </main>`;

    const summary = getComputedStyle(document.querySelector(".guide-summary")!);
    const list = getComputedStyle(document.querySelector(".guide-detail-block ul")!);
    const item = getComputedStyle(document.querySelector(".guide-detail-block li")!);
    const unselected = getComputedStyle(document.querySelector('.guide-category-card:not([data-selected="true"])')!);
    const selected = getComputedStyle(document.querySelector('.guide-category-card[data-selected="true"]')!);
    expect(summary.paddingBottom).toBe("10px");
    expect(list.paddingLeft).toBe("0px");
    expect(list.listStyleType).toBe("none");
    expect(item.display).toBe("grid");
    expect(item.gridTemplateColumns).toBe("4px minmax(0, 1fr)");
    expect(item.columnGap).toBe("4px");
    expect(item.fontSize).toBe("12px");
    expect(unselected.borderTopColor).not.toBe(selected.borderTopColor);
  });

  it("keeps the Matrix guide rail responsive while applying the requested spacing and scale", () => {
    const style = mountStyles(`${readCss("src/feature-pages.css")}\n${readCss("src/feature-page-adjustments.css")}`);
    style.dataset.layoutContract = "guide-rail-scale";
    document.body.innerHTML = `
      <main class="matrix-guide-screen">
        <nav class="guide-category-strip"><button class="guide-category-card"><span>01</span>分類</button></nav>
        <section class="guide-preview"><header><span>01</span><h2>分類</h2></header></section>
      </main>`;

    const rail = getComputedStyle(document.querySelector(".guide-category-strip")!);
    const card = getComputedStyle(document.querySelector(".guide-category-card")!);
    const cardNumber = getComputedStyle(document.querySelector(".guide-category-card > span")!);
    const previewNumber = getComputedStyle(document.querySelector(".guide-preview header > span")!);

    expect(rail.marginLeft).toBe("4px");
    expect(rail.marginRight).toBe("4px");
    expect(rail.scrollPaddingInline).toBe("20px");
    expect(card.minHeight).toBe("34.32px");
    expect(card.padding).toBe("6.24px 12.48px");
    expect(card.fontSize).toBe("18.72px");
    expect(cardNumber.fontSize).toBe("13.2px");
    expect(previewNumber.width).toBe("30px");
    expect(previewNumber.height).toBe("24px");
    expect(previewNumber.fontSize).toBe("11px");
  });

  it("uses one compact information-card rhythm for profile category detail pages", () => {
    const style = mountStyles(readCss("src/feature-pages.css"));
    style.dataset.layoutContract = "profile-category-details";
    document.body.innerHTML = `
      <main class="profile-detail-screen profile-info-screen"><div class="feature-body">
        <section class="panel detail-card"><h2>標題</h2><div><p>內容</p><ul><li>項目</li></ul></div></section>
      </div></main>`;

    const card = getComputedStyle(document.querySelector(".detail-card")!);
    const title = getComputedStyle(document.querySelector(".detail-card h2")!);
    const paragraph = getComputedStyle(document.querySelector(".detail-card p")!);
    const list = getComputedStyle(document.querySelector(".detail-card ul")!);

    expect(card.padding).toBe("12px");
    expect(title.fontSize).toBe("15px");
    expect(title.marginBottom).toBe("8px");
    expect(paragraph.lineHeight).toBe("1.65");
    expect(list.gap).toBe("6px");
  });
});
