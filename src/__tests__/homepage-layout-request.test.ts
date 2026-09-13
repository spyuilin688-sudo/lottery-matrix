// @vitest-environment jsdom

// @ts-expect-error Vitest runs on Node; this project intentionally omits global Node types from app compilation.
import { existsSync, readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";

declare const process: { cwd(): string };

const optionalLogoSpacingPath = "src/homepage/logo-spacing.css";
const cssPaths = [
  "src/homepage/base.css",
  "src/homepage/lottery-switcher.css",
  "src/homepage/visual-language.css",
  ...(existsSync(`${process.cwd()}/${optionalLogoSpacingPath}`) ? [optionalLogoSpacingPath] : []),
];
const css = cssPaths.map((path) => readFileSync(`${process.cwd()}/${path}`, "utf8")).join("\n");

function mountHomepage() {
  const style = document.createElement("style");
  style.textContent = css;
  document.head.append(style);
  document.body.innerHTML = `
    <div class="home-screen">
      <header class="brand-header"><img class="home-logo-image" alt="" /></header>
      <section class="app-screen home-content"><div class="mobile-scroll"><div class="mobile-scroll-content">
      <div class="home-layout">
        <main class="lottery-screen">
          <div class="lottery-switcher lottery-switcher--home-style">
            <div class="lottery-switcher-hit-grid">
              <button class="lottery-card" data-selected="true" data-lottery="今彩539"></button>
              <button class="lottery-card" data-selected="true" data-lottery="天天樂"></button>
              <button class="lottery-card" data-selected="true" data-lottery="六合彩"></button>
              <button class="lottery-card" data-selected="true" data-lottery="大樂透"></button>
            </div>
          </div>
          <section class="latest-draw-card"></section>
          <section class="matrix-status-section"><div class="matrix-status-card-grid"></div></section>
        </main>
        <div class="home-bottom-group">
          <button class="matrix-core-banner"></button>
          <nav class="home-shortcut-row"><button class="home-shortcut"><img alt="" /></button></nav>
        </div>
      </div>
      </div></div></section>
    </div>`;
  return style;
}

afterEach(() => {
  document.head.innerHTML = "";
  document.body.innerHTML = "";
});

describe("homepage requested spacing and selection", () => {
  it("reserves the logo above the content scroller with its natural height and 8px top gap", () => {
    mountHomepage();

    const brandHeader = getComputedStyle(document.querySelector(".brand-header")!);
    expect(getComputedStyle(document.querySelector(".home-layout")!).gridTemplateRows).toBe("auto auto");
    expect(getComputedStyle(document.querySelector(".lottery-screen")!).height).toBe("100%");
    expect(getComputedStyle(document.querySelector(".home-screen")!).gridTemplateRows).toBe("auto minmax(0, 1fr)");
    expect(getComputedStyle(document.querySelector(".home-content")!).minHeight).toBe("0px");
    expect(getComputedStyle(document.querySelector(".mobile-scroll")!).overflowY).toBe("auto");
    expect(brandHeader.alignItems).toBe("flex-start");
    expect(brandHeader.paddingTop).toBe("8px");
    expect(brandHeader.height).toBe("auto");
    expect(getComputedStyle(document.querySelector(".home-logo-image")!).height).toBe("auto");
    expect(getComputedStyle(document.querySelector(".home-logo-image")!).objectPosition).toBe("center bottom");
    expect(getComputedStyle(document.querySelector(".home-layout")!).getPropertyValue("--home-gap-features-nav").replaceAll(" ", "")).toBe("clamp(8px,1.15dvh,12px)");
  });

  it("uses the requested independent homepage spacing values", () => {
    mountHomepage();

    const layout = getComputedStyle(document.querySelector(".home-layout")!);
    const lotteryScreen = getComputedStyle(document.querySelector(".lottery-screen")!);
    const bottomGroup = getComputedStyle(document.querySelector(".home-bottom-group")!);

    expect(layout.getPropertyValue("--home-feature-inline").trim()).toBe("16px");
    expect(layout.getPropertyValue("--home-feature-gap").trim()).toBe("6px");
    expect(layout.getPropertyValue("--home-gap-status-core").replaceAll(" ", "")).toBe("clamp(9px,1.35dvh,12px)");
    expect(layout.getPropertyValue("--home-gap-core-features").replaceAll(" ", "")).toBe("8px");
    expect(lotteryScreen.getPropertyValue("--home-gap-logo-switcher").replaceAll(" ", "")).toBe("clamp(13px,calc(1.15dvh+5px),16px)");
    expect(lotteryScreen.getPropertyValue("--home-gap-switcher-draw").replaceAll(" ", "")).toBe("clamp(7px,calc(0.9dvh+1px),9px)");
    expect(lotteryScreen.getPropertyValue("--home-gap-draw-status").replaceAll(" ", "")).toBe("clamp(9px,calc(1.15dvh+1px),12px)");
    expect(bottomGroup.getPropertyValue("--home-core-width").trim()).toContain("- 32px");
    expect(getComputedStyle(document.querySelector(".matrix-status-section")!).paddingInline).toBe("0px");
    const shortcutImage = getComputedStyle(document.querySelector(".home-shortcut img")!);
    expect(shortcutImage.width).toBe("100%");
    expect(shortcutImage.height).toBe("100%");
  });

  it.each([
    ["今彩539", "linear-gradient(90deg, #34c759, #ffd640, #3484ff, #ff3b30)"],
    ["天天樂", "linear-gradient(90deg, #1e76ff, #ffffff, #1e76ff)"],
    ["六合彩", "linear-gradient(90deg, #ff3b30, #1e76ff, #34c759)"],
    ["大樂透", "linear-gradient(90deg, #ffd640, #1e76ff, #ffd640)"],
  ])("restores the original %s selected palette", (lottery, palette) => {
    mountHomepage();
    const card = document.querySelector(`.lottery-card[data-lottery="${lottery}"]`)!;

    expect(getComputedStyle(card).getPropertyValue("--lottery-selected-horizontal-gradient").replaceAll(" ", "")).toBe(palette.replaceAll(" ", ""));
    expect(getComputedStyle(card).filter).toBe("none");
  });
});
