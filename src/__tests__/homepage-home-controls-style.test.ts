// @ts-expect-error Vitest runs on Node; this project intentionally omits global Node types from app compilation.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const homepageCss = readFileSync(new URL("../homepage-repair.css", import.meta.url), "utf8");
const prototypeCss = readFileSync(new URL("../prototype.css", import.meta.url), "utf8");

describe("homepage control layout rules", () => {
  it("gives every homepage lottery card a gold outer border", () => {
    expect(homepageCss).toMatch(/\.home-screen \.lottery-switcher > \.lottery-switcher-hit-grid > \.lottery-card\s*\{[^}]*border:\s*1px solid rgba\(229, 179, 77, \.56\);/s);
  });

  it("uses the reduced draw-order control height", () => {
    expect(homepageCss).toMatch(/\.home-screen \.latest-draw-card \.draw-order\s*\{[^}]*height:\s*26px;/s);
  });

  it("uses a 5px lower inset for the embedded next-draw information", () => {
    expect(homepageCss).toMatch(/\.home-screen \.latest-draw-card \.next-draw-info--embedded\s*\{[^}]*padding:\s*0 20px 5px;/s);
  });

  it("does not paint a black background behind the bottom navigation artwork", () => {
    expect(prototypeCss).not.toMatch(/\.bottom-navigation\s*\{[^}]*background:\s*#000;/s);
  });
});
