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
    expect(getComputedStyle(document.querySelector(".lottery-screen")!).getPropertyValue("--layout-page-inline")).toBe("12px");
    expect(getComputedStyle(document.querySelector(".latest-draw-card")!).width).toBe("100%");
    expect(getComputedStyle(document.querySelector(".matrix-status-section")!).width).toBe("100%");
    expect(getComputedStyle(document.querySelector(".home-bottom-group")!).getPropertyValue("--home-core-width")).toContain("32px");
    expect(getComputedStyle(document.querySelector(".home-shortcut-row")!).width).toBe("calc(100% - 8px)");
  });

  it("moves the complete draw-card top row upward by four pixels through grid geometry", () => {
    const style = mountStyles(readCss("src/homepage/base.css"));
    style.dataset.layoutContract = "draw-card";
    document.body.innerHTML = '<div class="home-screen"><section class="latest-draw-card"></section></div>';

    expect(getComputedStyle(document.querySelector(".latest-draw-card")!).gridTemplateRows).toBe("36px minmax(0, 1fr) 24px");
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
        <section class="explore-settings tiangong-settings"><div class="setting-grid"><fieldset><legend>探索球位</legend><div class="segmented three"><button></button></div></fieldset></div></section>
      </main>`;

    expect(getComputedStyle(document.querySelector(".matrix-page-switcher")!).gap).toBe("4px");
    expect(getComputedStyle(document.querySelector(".matrix-tianyan-screen .select-box")!).height).toBe("24px");
    expect(getComputedStyle(document.querySelector(".matrix-tiangong-screen fieldset button")!).height).toBe("24px");
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

  it("reduces activation and membership-plan cards structurally by fifteen percent", () => {
    const style = mountStyles(readCss("src/feature-pages.css"));
    style.dataset.layoutContract = "profile-details";
    document.body.innerHTML = `
      <main class="activation-code-screen"><div class="feature-body"><section class="panel referral-summary-card"></section></div></main>
      <main class="pro-plans-screen"><div class="feature-body"><div class="plan-carousel"><section class="plan-card"></section></div><section class="renewal-card"></section></div></main>`;

    expect(getComputedStyle(document.querySelector(".activation-code-screen .panel")!).width).toBe("85%");
    expect(getComputedStyle(document.querySelector(".referral-summary-card")!).padding).toBe("12px");
    expect(getComputedStyle(document.querySelector(".pro-plans-screen .plan-card")!).minHeight).toBe("202px");
    expect(getComputedStyle(document.querySelector(".pro-plans-screen .plan-card")!).padding).toBe("12px");
    expect(getComputedStyle(document.querySelector(".pro-plans-screen .renewal-card")!).width).toBe("85%");
  });
});
