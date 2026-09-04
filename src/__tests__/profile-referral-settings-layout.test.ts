// @vitest-environment jsdom

// @ts-expect-error Vitest runs on Node; this project intentionally omits global Node types from app compilation.
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";

declare const process: { cwd(): string };

const readCss = (path: string) => readFileSync(`${process.cwd()}/${path}`, "utf8");

function mountProfileSettings() {
  const style = document.createElement("style");
  style.textContent = `:root { --layout-page-inline: 24px; }\n${readCss("src/feature-pages.css")}\n${readCss("src/activation-code-layout.css")}\n${readCss("src/mobile-layout-polish.css")}`;
  document.head.append(style);
  document.body.innerHTML = `
    <main class="activation-code-screen"><div class="feature-body">
      <section class="panel referral-code-section">
        <div class="referral-summary-card">
          <div class="referral-code-row">
            <span class="referral-code-label">推薦碼：</span>
            <strong class="referral-code-value">MATRIX-7H4K9P</strong>
            <button class="referral-copy-button"><span class="gold-button referral-copy-button-visual">複製推薦碼</span></button>
          </div>
          <p class="action-feedback" role="status" aria-live="polite" aria-atomic="true" data-visible="false"><svg aria-hidden="true"></svg><span></span></p>
        </div>
        <div class="referral-input-card">
          <div class="code-entry-block"><input><button class="primary-action">確認</button></div>
          <p class="activation-result">推薦碼已儲存</p>
        </div>
        <button class="referral-rule-toggle">推薦成功認定</button>
      </section>
      <section class="panel activation-code-section">
        <div class="activation-card">
          <div class="activation-code-panel">
            <div class="code-entry-block"><input><button class="primary-action">確認</button></div>
            <p class="activation-result">啟動成功</p>
          </div>
        </div>
        <button class="referral-rule-toggle">啟動碼使用說明</button>
      </section>
    </div></main>
    <main class="profile-detail-screen profile-info-screen contact-support-screen"><div class="feature-body">
      <section class="panel detail-card"></section><section class="panel detail-card"></section><section class="panel detail-card"></section>
    </div></main>`;
}

afterEach(() => {
  document.head.innerHTML = "";
  document.body.innerHTML = "";
});

describe("profile referral and contact layout", () => {
  it("keeps the requested compact referral controls without changing their text size", () => {
    mountProfileSettings();

    const referralRule = document.querySelector<HTMLElement>(".referral-code-section .referral-rule-toggle")!;
    const activationRule = document.querySelector<HTMLElement>(".activation-code-section .referral-rule-toggle")!;
    const referralConfirm = document.querySelector<HTMLElement>(".referral-input-card .primary-action")!;
    const activationConfirm = document.querySelector<HTMLElement>(".activation-card .primary-action")!;
    const body = document.querySelector<HTMLElement>(".activation-code-screen .feature-body")!;

    expect(getComputedStyle(body).paddingInline).toBe("var(--layout-page-inline)");
    for (const rule of [referralRule, activationRule]) {
      expect(getComputedStyle(rule).paddingTop).toBe("4px");
      expect(getComputedStyle(rule).paddingBottom).toBe("4px");
      expect(getComputedStyle(rule).minHeight).toBe("0px");
    }
    for (const confirm of [referralConfirm, activationConfirm]) {
      expect(getComputedStyle(confirm).height).toBe("34px");
      expect(getComputedStyle(confirm).fontSize).toBe("20px");
    }
  });

  it("places the compact copy control eight pixels to the right of the referral code", () => {
    mountProfileSettings();

    const row = document.querySelector<HTMLElement>(".referral-code-row")!;
    const code = document.querySelector<HTMLElement>(".referral-code-value")!;
    const copy = document.querySelector<HTMLElement>(".referral-copy-button")!;
    const copyVisual = document.querySelector<HTMLElement>(".referral-copy-button-visual")!;

    expect(getComputedStyle(row).display).toBe("flex");
    expect(getComputedStyle(row).gap).toBe("8px");
    expect(getComputedStyle(copy).padding).toBe("0px");
    expect(getComputedStyle(copy).width).toBe("max-content");
    expect(getComputedStyle(copy).height).toBe("auto");
    expect(getComputedStyle(copy).minHeight).toBe("28px");
    expect(getComputedStyle(copy).borderStyle).toBe("none");
    expect(getComputedStyle(copy).transform).toBe("none");
    expect(getComputedStyle(copyVisual).display).toBe("inline-block");
    expect(getComputedStyle(copyVisual).padding).toBe("4px");
    expect(getComputedStyle(copyVisual).minHeight).toBe("28px");
    expect(getComputedStyle(copyVisual).borderStyle).toBe("solid");
    expect(getComputedStyle(copyVisual).transform).toBe("scale(.9)");
    expect(getComputedStyle(copyVisual).transformOrigin).toBe("right center");
    expect(Number.parseFloat(getComputedStyle(copyVisual).fontSize)).toBeLessThan(Number.parseFloat(getComputedStyle(code).fontSize));
  });

  it("keeps eight pixels around each code-entry divider and dynamic activation result", () => {
    mountProfileSettings();

    const blocks = Array.from(document.querySelectorAll<HTMLElement>(".activation-code-screen .code-entry-block"));
    const referralCard = document.querySelector<HTMLElement>(".referral-input-card")!;
    const activationPanel = document.querySelector<HTMLElement>(".activation-code-panel")!;

    expect(blocks).toHaveLength(2);
    for (const block of blocks) {
      expect(getComputedStyle(block).paddingBottom).toBe("8px");
      expect(getComputedStyle(block).borderBottomWidth).toBe("1px");
      expect(getComputedStyle(block).borderBottomStyle).toBe("solid");
    }
    expect(getComputedStyle(referralCard).gap).toBe("8px");
    expect(getComputedStyle(activationPanel).rowGap).toBe("8px");
  });

  it("reserves stable geometry for the initialized copy feedback live region", () => {
    mountProfileSettings();

    const feedback = document.querySelector<HTMLElement>(".action-feedback")!;
    expect(feedback.getAttribute("role")).toBe("status");
    expect(feedback.getAttribute("aria-live")).toBe("polite");
    expect(feedback.getAttribute("aria-atomic")).toBe("true");
    expect(getComputedStyle(feedback).display).toBe("flex");
    expect(getComputedStyle(feedback).minHeight).toBe("18px");
    expect(getComputedStyle(feedback).opacity).toBe("0");

    feedback.dataset.visible = "true";
    expect(getComputedStyle(feedback).minHeight).toBe("18px");
    expect(getComputedStyle(feedback).opacity).toBe("1");
  });

  it("uses the requested 16px contact gutter and eight-pixel card rhythm", () => {
    mountProfileSettings();

    const contactBody = document.querySelector<HTMLElement>(".contact-support-screen .feature-body")!;

    expect(getComputedStyle(contactBody).paddingInline).toBe("16px");
    expect(getComputedStyle(contactBody).gap).toBe("8px");
  });
});
