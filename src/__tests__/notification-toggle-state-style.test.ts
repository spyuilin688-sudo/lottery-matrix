// @vitest-environment jsdom

// @ts-expect-error Vitest runs on Node; this project intentionally omits global Node types from app compilation.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

declare const process: { cwd(): string };

const sharedCss = readFileSync(`${process.cwd()}/src/feature-pages.css`, "utf8");
const adjustmentCss = readFileSync(`${process.cwd()}/src/feature-page-adjustments.css`, "utf8");

function ruleBody(css: string, selector: string) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = css.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`, "s"));
  return match?.[1] ?? "";
}

describe("notification toggle state colors", () => {
  it("keeps the switch palette in the shared toggle owner", () => {
    const offTrack = ruleBody(sharedCss, ".toggle::before");
    const offThumb = ruleBody(sharedCss, ".toggle span");
    const onTrack = ruleBody(sharedCss, '.toggle[data-checked="true"]::before');
    const onThumb = ruleBody(sharedCss, '.toggle[data-checked="true"] span');

    expect(offTrack).toContain("border: 1px solid #46505B;");
    expect(offTrack).toContain("background: #111923;");
    expect(offThumb).toContain("background: #929AA3;");
    expect(onTrack).toContain("border-color: #D7AE55;");
    expect(onTrack).toContain("background: rgba(202, 160, 70, .28);");
    expect(onThumb).toContain("background: #FFF9EA;");
  });

  it("does not duplicate the state palette in notification-v2 overrides", () => {
    const offTrack = ruleBody(adjustmentCss, ".notifications-screen-v2 .toggle::before");
    const offThumb = ruleBody(adjustmentCss, ".notifications-screen-v2 .toggle span");
    const onTrack = ruleBody(adjustmentCss, '.notifications-screen-v2 .toggle[data-checked="true"]::before');
    const onThumb = ruleBody(adjustmentCss, '.notifications-screen-v2 .toggle[data-checked="true"] span');

    expect(offTrack).not.toMatch(/(?:border(?:-color)?|background)\s*:/);
    expect(offThumb).not.toMatch(/background\s*:/);
    expect(onTrack).toBe("");
    expect(onThumb).toContain("transform: translateX(20px);");
    expect(onThumb).not.toMatch(/background\s*:/);
  });
});
