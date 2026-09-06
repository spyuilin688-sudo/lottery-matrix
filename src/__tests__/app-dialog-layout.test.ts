// @vitest-environment jsdom

// @ts-expect-error Vitest runs on Node; this project intentionally omits global Node types from app compilation.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

declare const process: { cwd(): string };

const css = readFileSync(`${process.cwd()}/src/dialog/app-dialog.css`, "utf8");

function rule(selector: string) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = css.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`));
  expect(match, `Missing CSS rule: ${selector}`).not.toBeNull();
  return match?.[1] ?? "";
}

describe("shared front-end confirmation dialog layout", () => {
  it("uses a compact content-adaptive size with viewport safeguards and internal scrolling", () => {
    const content = rule(".app-dialog-content");

    expect(content).toMatch(/width:\s*280px/);
    expect(content).not.toMatch(/height:\s*200px/);
    expect(content).toMatch(/max-width:\s*calc\(100vw - \(var\(--layout-dialog-inline\) \* 2\)\)/);
    expect(content).toMatch(/max-height:\s*min\(78dvh, 480px\)/);
    expect(content).toMatch(/overflow:\s*auto/);
  });
});
