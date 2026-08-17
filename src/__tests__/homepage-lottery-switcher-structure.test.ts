// @ts-expect-error Vitest runs on Node; this project intentionally omits global Node types from app compilation.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("../Prototype.tsx", import.meta.url), "utf8");

describe("homepage lottery switcher structure", () => {
  it("uses the shared Matrixbba artwork as the only homepage switcher visual source", () => {
    expect(source).toContain('lotterySwitcher: `${STATUS_ASSET_BASE}/Matrixbba.png`');
    expect(source.match(/<LotterySwitcher selected=\{selected\} onChange=\{setSelected\} \/>/g)).toHaveLength(2);
    expect(source).not.toContain('<LotterySwitcher selected={selected} onChange={setSelected} independentCards />');
  });
});
