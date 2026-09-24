// @vitest-environment jsdom

// @ts-expect-error Vitest runs on Node; this project intentionally omits global Node types from app compilation.
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";

declare const process: { cwd(): string };

const readCss = (path: string) => readFileSync(`${process.cwd()}/${path}`, "utf8");
const notificationCss = () => `${readCss("src/design-tokens.css")}\n${readCss("src/feature-pages.css")}\n${readCss("src/feature-page-adjustments.css")}`;

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
  it("keeps notification groups at the requested 8px spacing with balanced mobile content", () => {
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

    expect(featureBody.paddingBlockStart).toBe("0px");
    expect(featureBody.paddingBlockEnd).toBe("calc(var(--layout-bottom-nav-clearance) + 8px)");
    expect(content.rowGap).toBe("8px");
    expect(list.gap).toBe("8px");
  });

  it("keeps disabled Matrix 摘星 readable without making its controls active", () => {
    mountStyles(notificationCss());
    document.body.innerHTML = `
      <main class="notifications-screen-v2">
        <article class="notification-row" data-notification-key="collision">
          <div class="notification-heading">
            <div class="notification-icon"><img alt="" /></div>
            <div class="notification-title"><h2><span>Matrix 摘星</span></h2></div>
            <div class="notification-actions"><button class="notification-settings-toggle" disabled>設定選項</button><button class="toggle" disabled><span></span></button></div>
          </div>
        </article>
      </main>`;

    const title = getComputedStyle(document.querySelector("[data-notification-key=collision] h2 span")!);
    const icon = getComputedStyle(document.querySelector("[data-notification-key=collision] .notification-icon img")!);
    const disabledControl = document.querySelector("[data-notification-key=collision] .toggle")! as HTMLButtonElement;

    expect(title.color).toBe("rgba(242, 242, 242, 0.82)");
    expect(icon.filter).toBe("brightness(.82) saturate(.66)");
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

    const normalActions = getComputedStyle(document.querySelector("[data-notification-key=result] .notification-actions")!);
    const normalSetting = getComputedStyle(document.querySelector("[data-notification-key=result] .notification-settings-toggle")!);
    const systemActions = getComputedStyle(document.querySelector("[data-notification-key=system] .notification-actions")!);
    const systemSetting = getComputedStyle(document.querySelector("[data-notification-key=system] .notification-settings-toggle")!);
    const systemTitle = getComputedStyle(document.querySelector("[data-notification-key=system] .notification-title")!);

    // jsdom does not resolve color-mix tokens in border shorthands; verify the owner.
    expect(readCss("src/feature-page-adjustments.css")).toMatch(/\.notification-group \.notification-row \+ \.notification-row\s*\{[^}]*border-top: 1px solid var\(--pwa-frame-divider\)/s);
    expect(readCss("src/feature-page-adjustments.css")).toMatch(/\.notification-inline-settings-content\s*\{[^}]*border-top: 1px solid var\(--pwa-frame-divider\)/s);
    expect(normalActions.gridTemplateColumns).toBe("56px 38px");
    expect(normalActions.gap).toBe("8px");
    expect(normalSetting.width).toBe("56px");
    expect(systemActions.gridTemplateColumns).toBe("56px 38px");
    expect(systemSetting.width).toBe("56px");
    expect(systemTitle.gap).toBe("0px");
  });

  it("keeps all notification icons within balanced 4px row padding", () => {
    mountStyles(notificationCss());
    for (const key of ["bet", "result", "status", "card", "collision", "expiry", "system"]) {
      document.body.innerHTML = `<main class="notifications-screen-v2"><section class="notification-group"><article class="notification-row" data-notification-key="${key}"><div class="notification-heading"><div class="notification-icon"></div></div></article><article class="notification-row"></article></section></main>`;
      const heading = getComputedStyle(document.querySelector(".notification-heading")!);
      expect(heading.paddingTop).toBe("4px");
      expect(heading.paddingBottom).toBe("4px");
    }
    expect(notificationCss()).not.toContain("notification-pro-badge");
    expect(notificationCss()).not.toContain("notification-icon-stack");
  });

  it("uses lighter title weight and more compact bulk actions", () => {
    mountStyles(notificationCss());
    document.body.innerHTML = `
      <main class="notifications-screen-v2">
        <div class="notification-title"><h2><span>選號提醒</span></h2></div>
        <div class="notification-bulk-actions">
          <button class="primary-action notification-bulk-enable"><span>全部開啟</span></button>
          <button class="notification-bulk-disable">全部關閉</button>
        </div>
      </main>`;

    const title = getComputedStyle(document.querySelector(".notification-title h2")!);
    const enable = getComputedStyle(document.querySelector(".notification-bulk-enable")!);
    const disable = getComputedStyle(document.querySelector(".notification-bulk-disable")!);
    const css = readCss("src/feature-page-adjustments.css");
    const source = readCss("src/NotificationsPagePatched.tsx");

    expect(title.fontWeight).toBe("600");
    expect(enable.height).toBe("29px");
    expect(disable.height).toBe("29px");
    expect(css).not.toMatch(/\.notification-bulk-enable\s*\{[^}]*background:\s*var\(--lottery-gold-600\)/s);
    expect(source).toContain('className="notification-bulk-enable primary-action"');
    expect(source).not.toContain("branded-explore-action");
    expect(source).toContain('className="notification-bulk-disable"');
    expect(css).not.toMatch(/\.notification-bulk-disable\s*\{[^}]*background:\s*#160f08/s);
    expect(css).toMatch(/\.notification-bulk-disable\s*\{[^}]*border:\s*1px solid var\(--pwa-frame-tertiary\)/s);
    expect(css).toMatch(/\.notification-bulk-disable\s*\{[^}]*color:\s*var\(--lottery-text-secondary\)/s);
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

    const css = readCss("src/feature-page-adjustments.css");
    expect(css).toMatch(/\.notification-time-select:has\(select option:checked:not\(\[value=""\]\)\)\s*\{[^}]*background: var\(--pwa-control-selected\);[^}]*border-color: var\(--pwa-frame-tertiary\)/s);
    expect(css).toMatch(/\.notification-bet-grid \.notification-time-select\.native-select:focus-within\s*\{[^}]*border-color: var\(--pwa-frame-primary\)/s);
    expect(css).toMatch(/select:has\(option:checked\[value=""\]\)\s*\{[^}]*color:\s*var\(--lottery-neutral-400\)/s);
    expect(css).toMatch(/\.notification-inline-settings-content:has\(\.notification-bet-grid\)\s*\{[^}]*padding:\s*5px 4px 6px/s);
  });
  it("keeps icons restrained, disclosures still, and compact controls touchable", () => {
    const css = readCss("src/feature-page-adjustments.css");
    const rule = (selector: string) => {
      const start = css.indexOf(selector + " {");
      expect(start).toBeGreaterThanOrEqual(0);
      return css.slice(start + selector.length + 2).split("}")[0];
    };
    expect(rule(".notifications-screen-v2 .notification-icon img")).toContain("width: 34px;");
    expect(rule(".notifications-screen-v2 .notification-icon img")).toContain("height: 34px;");
    expect(css).toContain("filter: brightness(.88) saturate(.74);");
    for (const selector of [".notifications-screen-v2 .notification-inline-settings", '.notifications-screen-v2 .notification-inline-settings[data-expanded="true"]']) {
      expect(rule(selector)).not.toMatch(/transform|translate|scale|blur/);
      expect(rule(selector)).toContain("grid-template-rows");
      expect(rule(selector)).toContain("opacity");
      expect(rule(selector)).toContain("visibility");
    }
    expect(rule(".notifications-screen-v2 .notification-settings-toggle")).toContain("color: var(--lottery-label);");
    expect(rule('.notifications-screen-v2 .notification-settings-toggle[aria-expanded="true"]')).toContain("color: var(--pwa-frame-secondary);");
    expect(rule(".notifications-screen-v2 .notification-settings-toggle")).toContain("width: 56px;");
    expect(rule(".notifications-screen-v2 .notification-settings-toggle")).toContain("height: 20px;");
    expect(rule(".notifications-screen-v2 .notification-actions > .notification-settings-toggle")).toContain("height: 44px;");
    expect(rule(".notifications-screen-v2 .notification-actions > .notification-settings-toggle::before")).toContain("height: 20px;");
    expect(rule(".notifications-screen-v2 .notification-actions > .toggle")).toContain("width: 38px;");
    expect(rule(".notifications-screen-v2 .notification-actions > .toggle")).toContain("height: 44px;");
    expect(rule(".notifications-screen-v2 .toggle::before")).toContain("height: 18px;");
    expect(rule(".notifications-screen-v2 .toggle span")).toContain("width: 14px;");
    expect(rule(".notifications-screen-v2 .notification-grid-row")).toContain("grid-template-columns: repeat(4, minmax(0, 1fr));");
    expect(rule(".notifications-screen-v2 .notification-grid-row")).toContain("gap: 4px;");
  });

  it("uses quiet choice borders and label text while retaining gold checkboxes", () => {
    const css = readCss("src/feature-page-adjustments.css");
    expect(css).toMatch(/\.notification-inline-option-row \.notification-choice\s*\{[^}]*border: 1px solid var\(--pwa-frame-divider\)/s);
    expect(css).toMatch(/\.notification-choice:has\(input:checked\)\s*\{[^}]*border-color: var\(--pwa-frame-tertiary\);[^}]*background: var\(--pwa-control-selected\);[^}]*color: var\(--lottery-label\)/s);
    expect(css).toMatch(/input\[type="radio"\]\s*\{[^}]*width: 12px;[^}]*height: 12px;[^}]*accent-color: #d99b00/s);
  });

});
