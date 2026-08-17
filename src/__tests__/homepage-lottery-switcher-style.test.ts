// @ts-expect-error Vitest runs on Node; this project intentionally omits global Node types from app compilation.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("../homepage-repair.css", import.meta.url), "utf8");

describe("homepage layout rules", () => {
  it("sizes each independent lottery logo inside its own quarter hit area", () => {
    expect(css).toMatch(/\.home-screen \.lottery-switcher > \.lottery-switcher-hit-grid > \.lottery-card > img\s*\{[^}]*width:\s*100%;[^}]*height:\s*100%;[^}]*object-fit:\s*contain;[^}]*pointer-events:\s*none;/s);
  });

  it("separates next draw and remaining time by spacing without a divider", () => {
    expect(css).not.toMatch(/\.next-draw-info--embedded::before\s*\{/);
    expect(css).toMatch(/\.next-draw-info--embedded\s+\.next-draw-item:last-child\s*\{[^}]*padding-left:\s*16px;/s);
  });
});
