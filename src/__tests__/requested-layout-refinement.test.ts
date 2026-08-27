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
    expect(getComputedStyle(document.querySelector(".latest-draw-card")!).width).toBe("100%");
    expect(getComputedStyle(document.querySelector(".matrix-status-section")!).width).toBe("100%");
    expect(getComputedStyle(document.querySelector(".home-bottom-group")!).getPropertyValue("--home-core-width")).toContain("32px");
    expect(getComputedStyle(document.querySelector(".home-shortcut-row")!).width).toBe("calc(100% - 8px)");
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

    expect(getComputedStyle(document.querySelector(".matrix-page-switcher")!).gap).toBe("4px");
    expect(getComputedStyle(document.querySelector(".matrix-tianyan-screen .select-box")!).height).toBe("24px");
    expect(getComputedStyle(document.querySelector(".matrix-tiangong-screen .tiangong-setting-row")!).gridTemplateColumns).toBe("88.8px minmax(0, 1fr)");
    expect(getComputedStyle(document.querySelector(".matrix-tiangong-screen .tiangong-setting-row button")!).height).toBe("24px");
    expect(getComputedStyle(document.querySelector(".matrix-tiangong-screen .tiangong-results-head")!).gridTemplateColumns).toBe("minmax(0, 1fr) minmax(0, 1fr) minmax(0, .8fr) minmax(0, 1.25fr)");
  });

  it("uses eight-pixel profile rhythm and six-pixel card top padding", () => {
    const style = mountStyles(readCss("src/feature-pages.css"));
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
    expect(getComputedStyle(document.querySelector(".referral-summary-card")!).padding).toBe("12px");
    expect(getComputedStyle(document.querySelector(".pro-plans-screen .plan-carousel")!).margin).toBe("0px");
    expect(getComputedStyle(document.querySelector(".pro-plans-screen .plan-carousel")!).paddingLeft).toBe("0px");
    expect(getComputedStyle(document.querySelector(".pro-plans-screen .plan-card")!).flexBasis).toBe("100%");
    expect(getComputedStyle(document.querySelector(".pro-plans-screen .plan-card")!).minHeight).toBe("202px");
    expect(getComputedStyle(document.querySelector(".pro-plans-screen .plan-card")!).padding).toBe("12px");
    expect(getComputedStyle(document.querySelector(".pro-plans-screen .renewal-card")!).width).toBe("100%");
  });

  it("uses compact dark-gold actions on activation and membership-plan pages", () => {
    const style = mountStyles(readCss("src/feature-pages.css"));
    style.dataset.layoutContract = "profile-actions";
    document.body.innerHTML = `
      <main class="activation-code-screen"><button class="gold-button"></button></main>
      <main class="pro-plans-screen"><button class="confirm-payment"></button></main>`;

    const activationButton = getComputedStyle(document.querySelector(".activation-code-screen .gold-button")!);
    const paymentButton = getComputedStyle(document.querySelector(".pro-plans-screen .confirm-payment")!);
    expect(activationButton.height).toBe("34px");
    expect(activationButton.backgroundColor).toBe("rgb(6, 13, 18)");
    expect(activationButton.borderTopWidth).toBe("1px");
    expect(paymentButton.height).toBe("34px");
    expect(paymentButton.backgroundColor).toBe("rgb(6, 13, 18)");
    expect(paymentButton.borderTopWidth).toBe("1px");
  });
});
