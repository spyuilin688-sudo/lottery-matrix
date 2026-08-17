// @ts-expect-error Vitest runs on Node; this project intentionally omits global Node types from app compilation.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("../homepage-repair.css", import.meta.url), "utf8");

describe("homepage lottery switcher layout", () => {
  it("sizes each independent lottery logo inside its own quarter hit area", () => {
    expect(css).toMatch(/\.home-screen \.lottery-switcher > \.lottery-switcher-hit-grid > \.lottery-card > img\s*\{[^}]*width:\s*100%;[^}]*height:\s*100%;[^}]*object-fit:\s*contain;[^}]*pointer-events:\s*none;/s);
  });
});
