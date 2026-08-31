// @vitest-environment jsdom

// @ts-expect-error Vitest runs on Node; this project intentionally omits global Node types from app compilation.
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";

declare const process: { cwd(): string };

const readCss = (path: string) => readFileSync(`${process.cwd()}/${path}`, "utf8");
const notificationCss = () => `${readCss("src/design-tokens.css")}\n${readCss("src/feature-pages.css")}\n${readCss("src/feature-page-adjustments.css")}\n${readCss("src/notification-visual-refinement.css")}`;

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
  it("gives notification groups more room while keeping the mobile content vertically balanced", () => {
    mountStyles(notificationCss());
    document.body.innerHTML = `
      <main class="notifications-screen-v2" style="--layout-bottom-nav-clearance:72px">
        <div class="feature-body">
          <div class="notification-content">
            <div class="notification-bulk-actions"></div>
            <div class="notification-list">
              <section class="notification-group"></section>
              <section class="notification-system-group"></section>
            </div>
          </div>
        </div>
      </main>`;

    const featureBody = getComputedStyle(document.querySelector(".feature-body")!);
    const content = getComputedStyle(document.querySelector(".notification-content")!);
    const list = getComputedStyle(document.querySelector(".notification-list")!);

    expect(featureBody.paddingBlockStart).toBe("4px");
    expect(featureBody.paddingBlockEnd).toBe("calc(var(--layout-bottom-nav-clearance) + 8px)");
    expect(content.rowGap).toBe("16px");
    expect(list.gap).toBe("12px");
  });

  it("keeps disabled Matrix 摘星 readable without making its controls active", () => {
    mountStyles(notificationCss());
    document.body.innerHTML = `
      <main class="notifications-screen-v2">
        <article class="notification-row" data-notification-key="collision">
          <div class="notification-heading">
            <div class="notification-icon"><img alt="" /></div>
            <div class="notification-title"><h2><em>Matrix Pro</em><span>Matrix 摘星</span></h2></div>
            <div class="notification-actions"><button class="notification-settings-toggle" disabled>設定選項</button><button class="toggle" disabled><span></span></button></div>
          </div>
        </article>
      </main>`;

    const title = getComputedStyle(document.querySelector("[data-notification-key=collision] h2 span")!);
    const badge = getComputedStyle(document.querySelector("[data-notification-key=collision] h2 em")!);
    const icon = getComputedStyle(document.querySelector("[data-notification-key=collision] .notification-icon img")!);
    const disabledControl = document.querySelector("[data-notification-key=collision] .toggle")! as HTMLButtonElement;

    expect(title.color).toBe("rgba(242, 242, 242, 0.82)");
    expect(badge.opacity).toBe("0.72");
    expect(icon.filter).toBe("brightness(1.06) contrast(1.04)");
    expect(disabledControl.disabled).toBe(true);
  });

  it("tightens notification controls and softens internal separators", () => {
    mountStyles(notificationCss());
    document.body.innerHTML = `
      <main class="notifications-screen-v2">
        <section class="notification-group">
          <article class="notification-row"></article>
          <article class="notification-row"><div class="notification-inline-settings"><div class="notification-inline-settings-content"></div></div></article>
        </section>
        <article class="notification-row" data-notification-key="system">
          <div class="notification-heading">
            <div class="notification-title"><h2><span>系統通知</span></h2><p class="notification-push-status">手機通知已開啟</p></div>
            <div class="notification-actions"><button class="notification-settings-toggle">設定選項</button><button class="toggle"><span></span></button></div>
          </div>
        </article>
        <article class="notification-row" data-notification-key="result">
          <div class="notification-heading"><div class="notification-actions"><button class="notification-settings-toggle">設定選項</button><button class="toggle"><span></span></button></div></div>
        </article>
      </main>`;

    const groupDivider = getComputedStyle(document.querySelector(".notification-group .notification-row + .notification-row")!);
    const inlineDivider = getComputedStyle(document.querySelector(".notification-inline-settings-content")!);
    const normalActions = getComputedStyle(document.querySelector("[data-notification-key=result] .notification-actions")!);
    const normalSetting = getComputedStyle(document.querySelector("[data-notification-key=result] .notification-settings-toggle")!);
    const systemActions = getComputedStyle(document.querySelector("[data-notification-key=system] .notification-actions")!);
    const systemSetting = getComputedStyle(document.querySelector("[data-notification-key=system] .notification-settings-toggle")!);
    const systemTitle = getComputedStyle(document.querySelector("[data-notification-key=system] .notification-title")!);

    expect(groupDivider.borderTopColor).toBe("rgba(170, 119, 46, 0.24)");
    expect(inlineDivider.borderTopColor).toBe("rgba(170, 119, 46, 0.24)");
    expect(normalActions.gridTemplateColumns).toBe("56px 38px");
    expect(normalActions.gap).toBe("8px");
    expect(normalSetting.width).toBe("56px");
    expect(systemActions.gridTemplateColumns).toBe("52px 38px");
    expect(systemSetting.width).toBe("52px");
    expect(systemTitle.gap).toBe("0px");
  });

  it("adds breathing room between the Matrix Pro label and its name", () => {
    mountStyles(notificationCss());
    document.body.innerHTML = `
      <main class="notifications-screen-v2"><div class="notification-title"><h2><em>Matrix Pro</em><span>Matrix 狀態</span></h2></div></main>`;

    expect(getComputedStyle(document.querySelector(".notification-title h2")!).gap).toBe("4px");
  });

  it("uses lighter title weight and more compact bulk actions", () => {
    mountStyles(notificationCss());
    document.body.innerHTML = `
      <main class="notifications-screen-v2">
        <div class="notification-title"><h2><span>選號提醒</span></h2></div>
        <div class="notification-bulk-actions">
          <button class="primary-action branded-explore-action notification-bulk-enable"><span>全部開啟</span></button>
          <button class="notification-bulk-disable">全部關閉</button>
        </div>
      </main>`;

    const title = getComputedStyle(document.querySelector(".notification-title h2")!);
    const enable = getComputedStyle(document.querySelector(".notification-bulk-enable")!);
    const disable = getComputedStyle(document.querySelector(".notification-bulk-disable")!);
    const css = readCss("src/notification-visual-refinement.css");
    const source = readCss("src/NotificationsPagePatched.tsx");

    expect(title.fontWeight).toBe("600");
    expect(enable.height).toBe("32px");
    expect(disable.height).toBe("32px");
    expect(css).not.toMatch(/\.notification-bulk-enable\s*\{[^}]*background:\s*var\(--lottery-gold-600\)/s);
    expect(source).toMatch(/className="notification-bulk-enable primary-action branded-explore-action"/);
    expect(css).toMatch(/\.notification-bulk-disable\s*\{[^}]*background:\s*var\(--lottery-neutral-900\)/s);
    expect(css).toMatch(/\.notification-bulk-disable\s*\{[^}]*border:\s*1px solid var\(--lottery-gold-500\)/s);
  });

  it("compacts and softens notification time choices", () => {
    mountStyles(notificationCss());
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

    const css = readCss("src/notification-visual-refinement.css");
    expect(css).toMatch(/\.notification-time-select::before\s*\{/s);
    expect(css).toMatch(/select:has\(option:checked\[value=""\]\)\s*\{[^}]*color:\s*var\(--lottery-neutral-400\)/s);
    expect(css).toMatch(/\.notification-inline-settings-content:has\(\.notification-bet-grid\)\s*\{[^}]*padding:\s*5px 4px 6px/s);
  });
});
