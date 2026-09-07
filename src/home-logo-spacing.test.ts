import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const patchPath = resolve(process.cwd(), "src/homepage/logo-spacing.css");
const entryPath = resolve(process.cwd(), "src/homepage-repair.css");

describe("homepage logo spacing isolation", () => {
  it("loads a dedicated responsive logo spacing patch without editing the base layout rules", () => {
    expect(existsSync(patchPath)).toBe(true);

    const patch = readFileSync(patchPath, "utf8");
    const entry = readFileSync(entryPath, "utf8");

    expect(entry).toContain('@import "./homepage/logo-spacing.css";');
    expect(patch).toMatch(/\.home-screen \.lottery-screen > \.brand-header\s*\{[^}]*flex:\s*0 0 auto;/s);
    expect(patch).toMatch(/\.home-screen \.brand-header\s*\{[^}]*padding-top:\s*clamp\(8px,\s*1dvh,\s*12px\);/s);
    expect(patch).toMatch(/\.home-screen \.home-logo-image\s*\{[^}]*width:\s*87\.584%;[^}]*height:\s*auto;/s);
  });
});
