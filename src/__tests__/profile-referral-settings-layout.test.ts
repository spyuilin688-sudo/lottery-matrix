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
          <div class="referral-summary-heading"><h2>我的推薦碼</h2><p class="referral-success-count">推薦成功 <strong>0</strong> 人</p></div>
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
      <section class="panel detail-card"><h2>聯絡客服</h2><a href="mailto:Matrix1150801@gmail.com">Matrix1150801@gmail.com</a><div class="contact-support-phone-row"><a href="tel:+886226861828">(02) 2686-1828</a></div></section><section class="panel detail-card"><h2>問題回報</h2><a href="mailto:Matrix1150801@gmail.com">Matrix1150801@gmail.com</a></section><section class="panel detail-card"><h2>商務合作</h2><a href="mailto:Matrix1150801@gmail.com">Matrix1150801@gmail.com</a></section>
    </div></main>`;
}

afterEach(() => {
  document.head.innerHTML = "";
  document.body.innerHTML = "";
});

describe("profile referral and contact layout", () => {
  it("uses 16px confirmation text while preserving compact control heights", () => {
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
      expect(getComputedStyle(confirm).fontSize).toBe("16px");
    }
  });

  it("places the label above the code and copy control with the success count at the right", () => {
    mountProfileSettings();

    const row = document.querySelector<HTMLElement>(".referral-code-row")!;
    const code = document.querySelector<HTMLElement>(".referral-code-value")!;
    const copy = document.querySelector<HTMLElement>(".referral-copy-button")!;

    expect(getComputedStyle(row).display).toBe("grid");
    expect(getComputedStyle(row).gridTemplateColumns).toBe("minmax(0, 1fr) auto");
    expect(getComputedStyle(document.querySelector(".referral-code-label")!).gridColumn).toBe("1 / -1");
    expect(getComputedStyle(document.querySelector(".referral-summary-heading")!).justifyContent).toBe("space-between");
    expect(getComputedStyle(code).overflowWrap).toBe("anywhere");
    expect(getComputedStyle(code).whiteSpace).toBe("normal");
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

  it("uses readable contact links with eight pixels before the phone", () => {
    mountProfileSettings();
    for (const link of document.querySelectorAll(".contact-support-screen a")) {
      const style = getComputedStyle(link);
      expect(style.color).toBe("rgb(229, 195, 110)");
      expect(style.fontSize).toBe("14px");
      expect(style.textDecoration).toBe("underline");
    }
    expect(getComputedStyle(document.querySelector(".contact-support-screen h2")!).fontSize).toBe("15px");
    expect(getComputedStyle(document.querySelector(".contact-support-phone-row")!).marginTop).toBe("8px");
  });

  it("aligns the three referral rule labels with the input without moving activation instructions", () => {
    mountProfileSettings();
    const referral = getComputedStyle(document.querySelector(".referral-code-section .referral-rule-toggle")!);
    const activation = getComputedStyle(document.querySelector(".activation-code-section .referral-rule-toggle")!);
    expect(referral.paddingInline).toBe("0px");
    expect(activation.paddingLeft).toBe("16px");
    expect(activation.paddingRight).toBe("16px");
  });
});
