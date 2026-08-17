import { describe, expect, it } from "vitest";
// @ts-expect-error Vite resolves CSS raw imports during tests.
import css from "../homepage-repair.css?raw";

describe("homepage lottery switcher layout", () => {
  it("sizes each independent lottery logo inside its own quarter hit area", () => {
    expect(css).toMatch(/\.home-screen \.lottery-switcher > \.lottery-switcher-hit-grid > \.lottery-card > img\s*\{[^}]*width:\s*100%;[^}]*height:\s*100%;[^}]*object-fit:\s*contain;[^}]*pointer-events:\s*none;/s);
  });
});
