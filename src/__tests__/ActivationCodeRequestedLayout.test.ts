// @vitest-environment jsdom

// @ts-expect-error Vitest runs on Node; this project intentionally omits global Node types from app compilation.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

declare const process: { cwd(): string };

const readSource = (path: string) => readFileSync(`${process.cwd()}/${path}`, "utf8");
const memberPagesSource = readSource("src/features/MemberPages.tsx");
const activationLayoutCss = readSource("src/activation-code-layout.css");

describe("activation code requested layout", () => {
  it("removes the redundant visible referral labels while preserving the input accessible name", () => {
    expect(memberPagesSource).not.toContain('<span className="referral-code-label">推薦碼：</span>');
    expect(memberPagesSource).not.toContain("<h2>輸入推薦碼</h2>");
    expect(memberPagesSource).toMatch(/<input id="referral-code"[\s\S]*?aria-label="推薦碼"/);
  });

  it("draws the divider directly under the activation-code toggle from its canonical layout owner", () => {
    const matches = [...activationLayoutCss.matchAll(/\.activation-code-screen \.activation-card-toggle\s*\{([^}]*)\}/g)];
    expect(matches).toHaveLength(1);
    expect(matches[0][1]).toContain("border-bottom: 1px solid var(--pwa-frame-divider);");
  });
});
