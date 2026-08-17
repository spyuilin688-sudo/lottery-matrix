// @ts-expect-error Vitest runs on Node; this project intentionally omits global Node types from app compilation.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("../homepage-repair.css", import.meta.url), "utf8");

describe("homepage layout rules", () => {
  it("does not keep a second independent-logo visual rule over the shared switcher artwork", () => {
    expect(css).not.toMatch(/\.home-screen \.lottery-switcher > \.lottery-switcher-hit-grid > \.lottery-card > img\s*\{/);
  });

  it("uses the canonical 8px logo-to-switcher gap", () => {
    expect(css).toMatch(/\.home-screen \.lottery-screen\s*\{[^}]*--home-gap-logo-switcher:\s*8px;/s);
    expect(css).toMatch(/\/\* Canonical homepage flow gaps[\s\S]*?\.home-screen \.lottery-switcher\s*\{[^}]*margin-block-start:\s*var\(--home-gap-logo-switcher\);/s);
  });

  it("uses only the draw card margin for the switcher-to-draw gap", () => {
    expect(css).not.toMatch(/\.home-screen \.lottery-switcher\s*\{[^}]*margin-block-end:\s*8px;/s);
    expect(css).toMatch(/\.home-screen \.latest-draw-card\s*\{[^}]*margin-block-start:\s*var\(--home-gap-switcher-draw\);/s);
  });

  it("separates next draw and remaining time by spacing without a divider", () => {
    expect(css).not.toMatch(/\.next-draw-info--embedded::before\s*\{/);
    expect(css).toMatch(/\.next-draw-info--embedded\s+\.next-draw-item:last-child\s*\{[^}]*padding-left:\s*16px;/s);
  });
});
