// @vitest-environment jsdom

// @ts-expect-error Vitest runs on Node; this project intentionally omits global Node types from app compilation.
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";

declare const process: { cwd(): string };

const css = [
  "src/homepage/base.css",
  "src/homepage/lottery-switcher.css",
  "src/homepage/visual-language.css",
].map((path) => readFileSync(`${process.cwd()}/${path}`, "utf8")).join("\n");

function mountHomepage() {
  const style = document.createElement("style");
  style.textContent = css;
  document.head.append(style);
  document.body.innerHTML = `
    <div class="home-screen">
      <div class="home-layout">
        <main class="lottery-screen">
          <header class="brand-header"><img class="home-logo-image" alt="" /></header>
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
          <nav class="home-shortcut-row"></nav>
        </div>
      </div>
    </div>`;
  return style;
}

afterEach(() => {
  document.head.innerHTML = "";
  document.body.innerHTML = "";
});

describe("homepage requested spacing and selection", () => {
  it("assigns surplus vertical space to the responsive logo region", () => {
    mountHomepage();

    expect(getComputedStyle(document.querySelector(".home-layout")!).gridTemplateRows).toBe("minmax(0, 1fr) auto");
    expect(getComputedStyle(document.querySelector(".lottery-screen")!).height).toBe("100%");
    expect(getComputedStyle(document.querySelector(".brand-header")!).flexGrow).toBe("1");
    expect(getComputedStyle(document.querySelector(".home-logo-image")!).height).toBe("100%");
  });

  it("uses the requested independent homepage spacing values", () => {
    mountHomepage();

    const layout = getComputedStyle(document.querySelector(".home-layout")!);
    const lotteryScreen = getComputedStyle(document.querySelector(".lottery-screen")!);
    const bottomGroup = getComputedStyle(document.querySelector(".home-bottom-group")!);

    expect(layout.getPropertyValue("--home-feature-inline").trim()).toBe("6px");
    expect(layout.getPropertyValue("--home-feature-gap").replaceAll(" ", "")).toBe("clamp(2px,.77vw,3px)");
    expect(layout.getPropertyValue("--home-gap-status-core").trim()).toBe("10px");
    expect(layout.getPropertyValue("--home-gap-core-features").trim()).toBe("14px");
    expect(lotteryScreen.getPropertyValue("--home-gap-switcher-draw").trim()).toBe("4px");
    expect(lotteryScreen.getPropertyValue("--home-gap-draw-status").trim()).toBe("8px");
    expect(bottomGroup.getPropertyValue("--home-core-width").trim()).toContain("- 28px");
    expect(getComputedStyle(document.querySelector(".matrix-status-section")!).paddingInline).toBe("2px");
  });

  it.each([
    ["今彩539", "linear-gradient(135deg, #34c759, #ffd640, #3484ff, #ff3b30)"],
    ["天天樂", "linear-gradient(135deg, #1e76ff, #ffffff, #1e76ff)"],
    ["六合彩", "linear-gradient(135deg, #ff3b30, #1e76ff, #34c759)"],
    ["大樂透", "linear-gradient(135deg, #ffd640, #1e76ff, #ffd640)"],
  ])("restores the original %s selected palette", (lottery, palette) => {
    mountHomepage();
    const card = document.querySelector(`.lottery-card[data-lottery="${lottery}"]`)!;

    expect(getComputedStyle(card).getPropertyValue("--lottery-selected-gradient").replaceAll(" ", "")).toBe(palette.replaceAll(" ", ""));
    expect(getComputedStyle(card).filter).toBe("none");
  });
});
