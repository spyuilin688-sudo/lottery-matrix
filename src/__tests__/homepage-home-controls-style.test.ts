// @ts-expect-error Vitest runs on Node; this project intentionally omits global Node types from app compilation.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
// @ts-expect-error Test helper is intentionally implemented as an untyped Node ESM module.
import { readLocalCss } from "../../tests/helpers/read-local-css.mjs";

const homepageCss = readLocalCss(new URL("../homepage-repair.css", import.meta.url));
const prototypeCss = readFileSync(new URL("../prototype.css", import.meta.url), "utf8");

describe("homepage control layout rules", () => {
  it("uses the shared Matrixbba sprite and scoped selection frame", () => {
    expect(homepageCss).toMatch(/\.lottery-switcher--home-style > \.lottery-switcher-hit-grid > \.lottery-card\s*\{[^}]*background-image:\s*url\("\/assets\/lottery\/status\/Matrixbba\.png"\);/s);
    expect(homepageCss).toMatch(/\.lottery-card\[data-selected="true"\]::before\s*\{/);
  });

  it("uses the current draw-order control height and requested spacing", () => {
    expect(homepageCss).toMatch(/\.home-screen \.latest-draw-card \.draw-order\s*\{[^}]*height:\s*25px;[^}]*gap:\s*2\.5px;/s);
  });

  it("lets the embedded next-draw information use the full card width", () => {
    expect(homepageCss).toMatch(/\.home-screen \.latest-draw-card \.next-draw-info--embedded\s*\{[^}]*width:\s*100%;[^}]*padding:\s*0;/s);
  });

  it("uses the canonical Matrix Core container background and responsive 1536 / 414 height token", () => {
    expect(homepageCss).toMatch(/\.home-screen \.home-bottom-group\s*\{[^}]*--home-core-height:\s*clamp\(68px, calc\(\(var\(--home-core-width\) \* 414 \/ 1536\) - 18px\), 79px\);/s);
    expect(homepageCss).toMatch(/\.home-screen \.matrix-core-banner\s*\{[^}]*background:\s*var\(--home-octagon-frame\),\s*url\("\/assets\/lottery\/functions\/matrixcore\.png"\) center \/ cover no-repeat;/s);
  });

  it("does not paint a black background behind the bottom navigation artwork", () => {
    expect(prototypeCss).not.toMatch(/\.bottom-navigation\s*\{[^}]*background:\s*#000;/s);
  });
});
