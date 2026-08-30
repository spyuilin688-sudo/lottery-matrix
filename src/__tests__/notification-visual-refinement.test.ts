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
  document.head.innerHTML = "";
  document.body.innerHTML = "";
});

describe("notification visual refinement", () => {
  it("uses lighter title weight and more compact bulk actions", () => {
    mountStyles(`${readCss("src/design-tokens.css")}\n${readCss("src/feature-pages.css")}\n${readCss("src/feature-page-adjustments.css")}`);
    document.body.innerHTML = `
      <main class="notifications-screen-v2">
        <div class="notification-title"><h2><span>選號提醒</span></h2></div>
        <div class="notification-bulk-actions">
          <button class="notification-bulk-enable">全部開啟</button>
          <button class="notification-bulk-disable">全部關閉</button>
        </div>
      </main>`;

    const title = getComputedStyle(document.querySelector(".notification-title h2")!);
    const enable = getComputedStyle(document.querySelector(".notification-bulk-enable")!);
    const disable = getComputedStyle(document.querySelector(".notification-bulk-disable")!);

    expect(title.fontWeight).toBe("600");
    expect(enable.height).toBe("calc(var(--layout-touch-target) - 8px)");
    expect(disable.height).toBe("calc(var(--layout-touch-target) - 8px)");
    expect(readCss("src/feature-page-adjustments.css")).toMatch(/\.notification-bulk-enable\s*\{[^}]*background:\s*var\(--lottery-gold-600\)/s);
    expect(readCss("src/feature-page-adjustments.css")).toMatch(/\.notification-bulk-disable\s*\{[^}]*background:\s*var\(--lottery-neutral-900\)/s);
  });

  it("compacts and softens notification time choices", () => {
    mountStyles(`${readCss("src/design-tokens.css")}\n${readCss("src/feature-pages.css")}\n${readCss("src/feature-page-adjustments.css")}`);
    document.body.innerHTML = `
      <main class="notifications-screen-v2">
        <div class="notification-inline-settings-content">
          <div class="notification-matrix-grid notification-bet-grid">
            <div class="notification-grid-row notification-grid-time-row">
              <div class="select-box native-select notification-time-select"><select><option value="18:30" selected>18：30</option></select></div>
            </div>
            <div class="notification-grid-row notification-grid-time-row">
              <div class="select-box native-select notification-time-select"><select><option value="" selected>選擇時間</option></select></div>
            </div>
          </div>
        </div>
      </main>`;

    const selects = document.querySelectorAll(".notification-time-select");
    expect(getComputedStyle(selects[0]).height).toBe("21px");
    expect(getComputedStyle(selects[1]).height).toBe("21px");
    expect(getComputedStyle(document.querySelectorAll(".notification-grid-time-row")[1]).marginBlockStart).toBe("1px");

    const css = readCss("src/feature-page-adjustments.css");
    expect(css).toMatch(/\.notification-time-select::before\s*\{/s);
    expect(css).toMatch(/select:has\(option:checked\[value=""\]\)\s*\{[^}]*color:\s*var\(--lottery-neutral-400\)/s);
  });
});
