// @ts-expect-error Vitest runs on Node; this project intentionally omits global Node types from app compilation.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("../Prototype.tsx", import.meta.url), "utf8");

describe("homepage lottery switcher structure", () => {
  it("renders the shared LotterySwitcher as the only homepage switcher component", () => {
    expect(source).toContain('<LotterySwitcher selected={selected} onChange={setSelected} className="lottery-switcher--home-style home-switcher-box" />');
    expect(source).not.toContain('independentCards');
  });
});
