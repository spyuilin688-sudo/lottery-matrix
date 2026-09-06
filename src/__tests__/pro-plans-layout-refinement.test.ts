// @vitest-environment jsdom

// @ts-expect-error Vitest runs on Node; this project intentionally omits global Node types from app compilation.
import { existsSync, readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";

declare const process: { cwd(): string };

const ownerPath = `${process.cwd()}/src/pro-plans-layout.css`;
const ownerExists = existsSync(ownerPath);
const ownerCss = ownerExists ? readFileSync(ownerPath, "utf8") : "";
const mobileCss = readFileSync(`${process.cwd()}/src/mobile-layout-polish.css`, "utf8");
const css = [
  readFileSync(`${process.cwd()}/src/feature-pages.css`, "utf8"),
  ownerCss,
  readFileSync(`${process.cwd()}/src/pro-plans-carousel-peek.css`, "utf8"),
].join("\n");

function mountPlans() {
  const style = document.createElement("style");
  style.textContent = css;
  document.head.append(style);
  document.body.innerHTML = `
    <main class="pro-plans-screen">
      <div class="feature-body">
        <div class="plan-carousel">
          <article class="plan-card" data-current="false"></article>
          <article class="plan-card" data-current="true"></article>
        </div>
        <div class="pro-plans-checkout">
          <section class="panel renewal-card">
            <h2>管理訂閱／續訂方案</h2>
            <dl><div><dt>已選方案：</dt><dd>月費方案</dd></div></dl>
            <div class="auto-renew-setting"><label><input type="checkbox" /><span>自動續訂</span></label><strong>目前狀態：關閉</strong></div>
            <p class="auto-renew-note">手動轉帳不會自動扣款。</p>
          </section>
          <button class="confirm-payment primary-action branded-explore-action">確定付款</button>
          <p class="payment-note">點擊確定付款將跳轉付款頁面</p>
        </div>
      </div>
    </main>`;
}

afterEach(() => {
  document.head.innerHTML = "";
  document.body.innerHTML = "";
});

describe("Matrix Pro plan layout refinement", () => {
  it("uses one reachable page-scoped owner without legacy pull-out overrides", () => {
    expect(ownerExists).toBe(true);
    expect(ownerCss).toMatch(/\.pro-plans-screen\s*\{[^}]*--pro-plans-plan-inline:\s*25px;[^}]*--pro-plans-checkout-inline:\s*16px;/s);
    expect(ownerCss).toMatch(/\.pro-plans-screen\s*>\s*\.feature-body\s*\{[^}]*padding-inline:\s*0;/s);
    expect(ownerCss).toMatch(/\.pro-plans-screen \.plan-carousel\s*\{[^}]*width:\s*100%;[^}]*margin:\s*0;[^}]*padding:\s*0 var\(--pro-plans-plan-inline\) 18px;[^}]*scroll-padding-inline:\s*var\(--pro-plans-plan-inline\);[^}]*gap:\s*var\(--pro-plans-plan-inline\);/s);
    expect(ownerCss).toMatch(/\.pro-plans-screen \.plan-card\s*\{[^}]*flex:\s*0 0 calc\(100% - 24px\);/s);
    expect(ownerCss).toMatch(/\.pro-plans-screen \.pro-plans-checkout\s*\{[^}]*margin-inline:\s*var\(--pro-plans-checkout-inline\);[^}]*row-gap:\s*0;/s);
    expect(ownerCss).not.toMatch(/--pro-plans-inline\s*:/);
    expect(ownerCss).not.toMatch(/\.pro-plans-screen \.renewal-card\s*\{[^}]*margin-inline\s*:/s);
    expect(ownerCss).not.toMatch(/\.pro-plans-screen \.confirm-payment\.branded-explore-action\s*\{[^}]*margin-inline\s*:/s);
    expect(ownerCss).not.toMatch(/margin-inline:\s*-[\d.]+px/);
    expect(ownerCss).not.toMatch(/width:\s*calc\(100%\s*\+/);
    expect(mobileCss).not.toMatch(/\.pro-plans-screen/);
  });

  it("uses the approved card sizing and visual hierarchy", () => {
    mountPlans();

    const idlePlan = getComputedStyle(document.querySelector('.plan-card[data-current="false"]')!);
    const currentPlan = getComputedStyle(document.querySelector('.plan-card[data-current="true"]')!);
    const renewal = getComputedStyle(document.querySelector(".renewal-card")!);

    expect(idlePlan.minHeight).toBe("190px");
    expect(idlePlan.height).toBe("auto");
    expect(idlePlan.padding).toBe("12px");
    expect(idlePlan.borderTopColor).toBe("rgb(117, 83, 41)");
    expect(currentPlan.borderTopColor).toBe("rgb(214, 164, 43)");
    expect(renewal.padding).toBe("8px");
    expect(renewal.borderTopColor).toBe("rgb(117, 83, 41)");
    expect(getComputedStyle(document.querySelector(".renewal-card dl > div")!).minHeight).toBe("29px");
    expect(getComputedStyle(document.querySelector(".renewal-card h2")!).fontWeight).toBe("700");
    expect(getComputedStyle(document.querySelector(".renewal-card dt")!).fontWeight).toBe("700");
    expect(getComputedStyle(document.querySelector(".renewal-card dd")!).fontWeight).toBe("700");
    expect(getComputedStyle(document.querySelector(".auto-renew-setting label")!).fontWeight).toBe("700");
    expect(getComputedStyle(document.querySelector(".auto-renew-note")!).fontWeight).toBe("700");
    expect(getComputedStyle(document.querySelector(".auto-renew-setting label")!).gap).toBe("4px");
    expect(getComputedStyle(document.querySelector(".auto-renew-setting input")!).width).toBe("14px");
    expect(getComputedStyle(document.querySelector(".auto-renew-setting input")!).height).toBe("14px");
  });

  it("uses the approved checkout spacing and readable payment help", () => {
    mountPlans();

    const checkout = getComputedStyle(document.querySelector(".pro-plans-checkout")!);
    const renewal = getComputedStyle(document.querySelector(".renewal-card")!);
    const payment = getComputedStyle(document.querySelector(".confirm-payment")!);
    const note = getComputedStyle(document.querySelector(".payment-note")!);

    expect(checkout.rowGap).toBe("0px");
    expect(renewal.marginBottom).toBe("8px");
    expect(payment.marginBottom).toBe("6px");
    expect(note.fontSize).toBe("11px");
  });
});
