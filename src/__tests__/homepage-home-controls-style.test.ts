// @ts-expect-error Vitest runs on Node; this project intentionally omits global Node types from app compilation.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
// @ts-expect-error Test helper is intentionally implemented as an untyped Node ESM module.
import { readLocalCss } from "../../tests/helpers/read-local-css.mjs";

const homepageCss = readLocalCss(new URL("../homepage-repair.css", import.meta.url));
const prototypeCss = readFileSync(new URL("../prototype.css", import.meta.url), "utf8");

describe("homepage control layout rules", () => {
  it("uses the shared Matrixbba sprite and restores selected artwork brightness", () => {
    expect(homepageCss).toMatch(/\.lottery-switcher--home-style > \.lottery-switcher-hit-grid > \.lottery-card\s*\{[^}]*background-image:\s*url\("\/assets\/lottery\/status\/Matrixbba\.png"\);/s);
    expect(homepageCss).toMatch(/\.lottery-card\[data-selected="true"\]\s*\{[^}]*background-color:\s*transparent;/s);
    expect(homepageCss).not.toMatch(/\.lottery-card\[data-selected="true"\]::before\s*\{/);
  });

  it("uses the current draw-order control height and requested spacing", () => {
    expect(homepageCss).toMatch(/\.home-screen \.latest-draw-card \.draw-order\s*\{[^}]*height:\s*25px;[^}]*gap:\s*2\.5px;/s);
  });

  it("lets the embedded next-draw information use the full card width", () => {
    expect(homepageCss).toMatch(/\.home-screen \.latest-draw-card \.next-draw-info--embedded\s*\{[^}]*width:\s*100%;[^}]*padding:\s*0;/s);
  });

  it("keeps the approved 654:181 Core proportion without a compensating height subtraction", () => {
    // DESIGN.md 2026-09-14 specifies the current ratio; the former -18px patch is retired.
    const heights = [...homepageCss.matchAll(/--home-core-height:\s*([^;]+);/g)];
    expect(heights).toHaveLength(1);
    expect(heights[0][1]).toBe("calc(var(--home-core-width) * 181 / 654)");
    expect(homepageCss).toMatch(/\.home-screen \.matrix-core-banner\s*\{[^}]*height:\s*var\(--home-core-height\);/s);
    expect(homepageCss).not.toMatch(/\.home-screen \.matrix-core-banner\s*\{[^}]*background:[^;]*var\(--home-octagon-frame\)/s);
  });

  it("does not paint a black background behind the bottom navigation artwork", () => {
    expect(prototypeCss).not.toMatch(/\.bottom-navigation\s*\{[^}]*background:\s*#000;/s);
  });
});
