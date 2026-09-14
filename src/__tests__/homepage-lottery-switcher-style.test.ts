import { describe, expect, it } from "vitest";
// @ts-expect-error Test helper is intentionally implemented as an untyped Node ESM module.
import { readLocalCss } from "../../tests/helpers/read-local-css.mjs";

const css = readLocalCss(new URL("../homepage-repair.css", import.meta.url));

describe("homepage layout rules", () => {
  it("does not keep a second independent-logo visual rule over the shared switcher artwork", () => {
    expect(css).not.toMatch(/\.home-screen \.lottery-switcher > \.lottery-switcher-hit-grid > \.lottery-card > img\s*\{/);
  });

  it("uses the requested responsive logo-to-switcher gap", () => {
    expect(css).toMatch(/\.home-screen \.lottery-screen\s*\{[^}]*--home-gap-logo-switcher:\s*clamp\(13px,\s*calc\(1\.15dvh \+ 5px\),\s*16px\);/s);
    expect(css).toMatch(/\/\* Canonical homepage flow gaps[\s\S]*?\.home-screen \.lottery-switcher\s*\{[^}]*margin-block-start:\s*var\(--home-gap-logo-switcher\);/s);
  });

  it("uses only the draw card margin for the switcher-to-draw gap", () => {
    expect(css).not.toMatch(/\.home-screen \.lottery-switcher\s*\{[^}]*margin-block-end:\s*8px;/s);
    expect(css).toMatch(/\.home-screen \.latest-draw-card\s*\{[^}]*margin-block-start:\s*var\(--home-gap-switcher-draw\);/s);
  });

  it("gives each time field its approved gold frame without a duplicate divider", () => {
    expect(css).not.toMatch(/\.next-draw-info--embedded::before\s*\{/);
    expect(css).toMatch(/\.next-draw-info--embedded \.next-draw-item\s*\{[^}]*box-shadow:\s*inset 0 0 0 1px var\(--home-frame-gold\);/s);
    expect(css).toMatch(/\.next-draw-info--embedded \.next-draw-item\s*\{[^}]*padding-inline:\s*clamp\(6px, 2vw, 10px\);/s);
  });
});
