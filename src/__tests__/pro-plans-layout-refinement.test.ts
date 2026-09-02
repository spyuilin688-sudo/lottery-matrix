// @vitest-environment jsdom

// @ts-expect-error Vitest runs on Node; this project intentionally omits global Node types from app compilation.
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";

declare const process: { cwd(): string };

const css = [
  "src/feature-pages.css",
  "src/pro-plans-carousel-peek.css",
  "src/mobile-layout-polish.css",
].map((path) => readFileSync(`${process.cwd()}/${path}`, "utf8")).join("\n");
const mobileCss = readFileSync(`${process.cwd()}/src/mobile-layout-polish.css`, "utf8");

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
          <section class="panel renewal-card"><h2>管理訂閱／續訂方案</h2><dl><div></div></dl></section>
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
  it("uses the approved card gutters, sizing, and visual hierarchy", () => {
    mountPlans();

    const idlePlan = getComputedStyle(document.querySelector('.plan-card[data-current="false"]')!);
    const currentPlan = getComputedStyle(document.querySelector('.plan-card[data-current="true"]')!);
    const renewal = getComputedStyle(document.querySelector(".renewal-card")!);

    expect(mobileCss).toMatch(/\.pro-plans-screen > \.feature-body\s*\{[^}]*padding-inline:\s*18px;/s);
    expect(mobileCss).toMatch(/\.pro-plans-screen \.plan-carousel\s*\{[^}]*margin-inline:\s*-18px;[^}]*padding:\s*0 18px 18px;/s);
    expect(idlePlan.minHeight).toBe("190px");
    expect(idlePlan.height).toBe("auto");
    expect(idlePlan.padding).toBe("12px");
    expect(idlePlan.borderTopColor).toBe("rgb(117, 83, 41)");
    expect(currentPlan.borderTopColor).toBe("rgb(214, 164, 43)");
    expect(renewal.padding).toBe("8px");
    expect(renewal.borderTopColor).toBe("rgb(117, 83, 41)");
    expect(getComputedStyle(document.querySelector(".renewal-card dl > div")!).minHeight).toBe("29px");
  });

  it("uses independent checkout spacing and readable payment help", () => {
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
