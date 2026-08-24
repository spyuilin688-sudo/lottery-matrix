import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const routerPath = join(root, "src", "FeaturePagesPatched.tsx");
const overridePath = join(root, "src", "pro-plans-carousel-peek.css");

test("會員方案卡露出下一張並顯示跟隨方案的分頁指示", () => {
  assert.equal(existsSync(overridePath), true, "缺少會員方案 Carousel 視覺覆寫檔");

  const router = readFileSync(routerPath, "utf8");
  const css = readFileSync(overridePath, "utf8");

  assert.match(router, /import\s+["']\.\/pro-plans-carousel-peek\.css["'];/);
  assert.match(css, /\.pro-plans-screen\s+\.plan-card\s*\{[\s\S]*?flex-basis:\s*calc\(100%\s*-\s*36px\)/);
  assert.match(css, /\.pro-plans-screen\s+\.plan-card\s*\{[\s\S]*?transform:\s*translateX\(-6px\)/);
  assert.match(css, /\.pro-plans-screen\s+\.plan-carousel\s*\{[\s\S]*?padding:\s*0\s+0\s+18px/);

  for (const index of [0, 1, 2]) {
    assert.match(
      css,
      new RegExp(`\\.pro-plans-screen\\s+\\.plan-carousel:has\\(\\.plan-card\\[data-current=["']true["']\\]\\[data-plan-index=["']${index}["']\\]\\)`),
      `缺少第 ${index + 1} 個方案的分頁指示狀態`,
    );
  }
});
