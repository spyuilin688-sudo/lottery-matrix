// @vitest-environment jsdom

// @ts-expect-error Vitest runs on Node; this project intentionally omits global Node types from app compilation.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

declare const process: { cwd(): string };

const css = readFileSync(`${process.cwd()}/src/feature-page-adjustments.css`, "utf8");

function ruleBody(selector: string) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = css.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`, "s"));
  return match?.[1] ?? "";
}

describe("notification toggle state colors", () => {
  it("uses the explicit off-state palette from the existing notification-v2 owner", () => {
    const track = ruleBody(".notifications-screen-v2 .toggle::before");
    const thumb = ruleBody(".notifications-screen-v2 .toggle span");

    expect(track).toContain("border: 1px solid #46505B;");
    expect(track).toContain("background: #111923;");
    expect(thumb).toContain("background: #929AA3;");
  });

  it("uses a gold track and warm-white thumb when the notification toggle is on", () => {
    const track = ruleBody('.notifications-screen-v2 .toggle[data-checked="true"]::before');
    const thumb = ruleBody('.notifications-screen-v2 .toggle[data-checked="true"] span');

    expect(track).toContain("border-color: #D7AE55;");
    expect(track).toContain("background: rgba(202, 160, 70, .28);");
    expect(thumb).toContain("background: #FFF9EA;");
  });
});
