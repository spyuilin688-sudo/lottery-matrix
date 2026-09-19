import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import postcss from "postcss";

const css = readFileSync("src/feature-pages.css", "utf8");
const rules = postcss.parse(css);
const backgrounds = new Map();
rules.walkDecls("--product-header-background", declaration => {
  for (const match of declaration.parent.selector.matchAll(/data-product-header="([^"]+)"/g)) {
    assert.equal(backgrounds.has(match[1]), false, `Duplicate background owner: ${match[1]}`);
    backgrounds.set(match[1], declaration.value);
  }
});

test("every known PWA title resolves to one of the 31 approved, available WebP backgrounds", () => {
  const header = readFileSync("src/features/BrandHeader.tsx", "utf8");
  const subtitles = header.split("const PAGE_SUBTITLES:")[1].split("\n};")[0];
  const titles = [...subtitles.matchAll(/^  "([^"]+)":/gm)].map(match => match[1]);
  for (const title of titles) assert.ok(backgrounds.has(title), `Missing background: ${title}`);
  const assets = new Set(backgrounds.values());
  assert.equal(assets.size, 31);
  for (const value of assets) {
    assert.match(value, /^url\("\/assets\/lottery\/headers\/[a-z-]+\.webp"\)$/);
    const bytes = readFileSync(`public${value.slice(5, -2)}`);
    assert.equal(bytes.toString("ascii", 0, 4), "RIFF");
    assert.equal(bytes.toString("ascii", 8, 12), "WEBP");
  }
});

test("Explore and all other title backgrounds share the canonical CSS owner", () => {
  const walk = directory => readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? walk(path) : path.endsWith(".css") ? [path] : [];
  });
  const owners = [];
  for (const path of walk("src")) {
    const source = readFileSync(path, "utf8");
    assert.ok(!source.includes('matrix-explore-header-background.css'), path);
    postcss.parse(source).walkDecls("--product-header-background", () => owners.push(path));
  }
  assert.deepEqual([...new Set(owners)], ["src/feature-pages.css"]);
  assert.equal(backgrounds.get("Matrix 探索"), 'url("/assets/lottery/headers/explore.webp")');
  const frame = rules.nodes.find(node => node.selector === ".product-header__frame");
  const background = frame.nodes.find(node => node.prop === "background").value;
  assert.match(background, /var\(--product-header-background-shade, linear-gradient\(transparent, transparent\)\)/);
  assert.ok(background.endsWith("#020609 var(--product-header-background) center / cover no-repeat"));
});
