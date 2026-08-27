// @ts-expect-error Vitest runs on Node; this project intentionally omits global Node types from app compilation.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
// @ts-expect-error Test helper is intentionally implemented as an untyped Node ESM module.
import { readLocalCss } from "../../tests/helpers/read-local-css.mjs";

const homepageCss = readLocalCss(new URL("../homepage-repair.css", import.meta.url));
const prototypeCss = readFileSync(new URL("../prototype.css", import.meta.url), "utf8");

describe("homepage control layout rules", () => {
  it("gives every homepage lottery card a gold outer border", () => {
    expect(homepageCss).toMatch(/\.lottery-switcher--home-style > \.lottery-switcher-hit-grid > \.lottery-card\s*\{[^}]*border:\s*1px solid rgba\(229, 179, 77, \.56\);/s);
  });

  it("uses the reduced draw-order control height", () => {
    expect(homepageCss).toMatch(/\.home-screen \.latest-draw-card \.draw-order\s*\{[^}]*height:\s*26px;/s);
  });

  it("uses a 5px lower inset for the embedded next-draw information", () => {
    expect(homepageCss).toMatch(/\.home-screen \.latest-draw-card \.next-draw-info--embedded\s*\{[^}]*padding:\s*0 20px 5px;/s);
  });

  it("uses the canonical Matrix Core container background and responsive 1536 / 414 height token", () => {
    expect(homepageCss).toMatch(/\.home-screen \.home-bottom-group\s*\{[^}]*--home-core-height:\s*calc\(var\(--home-core-width\) \* 414 \/ 1536\);/s);
    expect(homepageCss).toMatch(/\.home-screen \.matrix-core-banner\s*\{[^}]*height:\s*var\(--home-core-height\);[^}]*background:\s*url\("\/assets\/lottery\/functions\/matrixcore\.png"\) center \/ cover no-repeat;/s);
  });

  it("does not paint a black background behind the bottom navigation artwork", () => {
    expect(prototypeCss).not.toMatch(/\.bottom-navigation\s*\{[^}]*background:\s*#000;/s);
  });
});
