// @vitest-environment jsdom

// @ts-expect-error Vitest runs on Node; this project intentionally omits global Node types from app compilation.
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";

declare const process: { cwd(): string };

const readCss = (path: string) => readFileSync(`${process.cwd()}/${path}`, "utf8");

function mountProfileSettings() {
  const style = document.createElement("style");
  style.textContent = `:root { --layout-page-inline: 24px; }\n${readCss("src/feature-pages.css")}\n${readCss("src/mobile-layout-polish.css")}\n${readCss("src/activation-code-layout.css")}`;
  document.head.append(style);
  document.body.innerHTML = `
    <main class="activation-code-screen"><div class="feature-body">
      <section class="panel referral-code-section">
        <div class="referral-summary-card">
          <div class="referral-code-row">
            <span class="referral-code-label">推薦碼：</span>
            <strong class="referral-code-value">MATRIX-7H4K9P</strong>
            <button class="gold-button referral-copy-button">複製推薦碼</button>
          </div>
        </div>
        <div class="referral-input-card"><button class="primary-action">確認</button></div>
        <button class="referral-rule-toggle">推薦成功認定</button>
      </section>
      <section class="panel activation-code-section">
        <div class="activation-card"><button class="primary-action">確認</button></div>
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

    expect(getComputedStyle(body).paddingInline).toBe("16px");
    for (const rule of [referralRule, activationRule]) {
      expect(getComputedStyle(rule).paddingTop).toBe("4px");
      expect(getComputedStyle(rule).paddingBottom).toBe("4px");
      expect(getComputedStyle(rule).minHeight).toBe("0px");
    }
    for (const confirm of [referralConfirm, activationConfirm]) {
      expect(getComputedStyle(confirm).height).toBe("40px");
      expect(getComputedStyle(confirm).fontSize).toBe("20px");
    }
  });

  it("places the compact copy control eight pixels to the right of the referral code", () => {
    mountProfileSettings();

    const row = document.querySelector<HTMLElement>(".referral-code-row")!;
    const code = document.querySelector<HTMLElement>(".referral-code-value")!;
    const copy = document.querySelector<HTMLElement>(".referral-copy-button")!;

    expect(getComputedStyle(row).display).toBe("flex");
    expect(getComputedStyle(row).gap).toBe("8px");
    expect(getComputedStyle(copy).padding).toBe("4px");
    expect(getComputedStyle(copy).width).toBe("max-content");
    expect(getComputedStyle(copy).height).toBe("auto");
    expect(Number.parseFloat(getComputedStyle(copy).fontSize)).toBeLessThan(Number.parseFloat(getComputedStyle(code).fontSize));
  });

  it("uses the requested 16px contact gutter and eight-pixel card rhythm", () => {
    mountProfileSettings();

    const contactBody = document.querySelector<HTMLElement>(".contact-support-screen .feature-body")!;

    expect(getComputedStyle(contactBody).paddingInline).toBe("16px");
    expect(getComputedStyle(contactBody).gap).toBe("8px");
  });
});
