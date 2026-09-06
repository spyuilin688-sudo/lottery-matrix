import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const routerPath = join(root, "src", "Prototype.tsx");
const overridePath = join(root, "src", "pro-plans-carousel-peek.css");
const layoutPath = join(root, "src", "pro-plans-layout.css");
const mobileLayoutPath = join(root, "src", "mobile-layout-polish.css");

test("會員方案卡由正式版面 owner 控制左右間距並顯示跟隨方案的分頁指示", () => {
  assert.equal(existsSync(overridePath), true, "缺少會員方案 Carousel 指示點樣式");
  assert.equal(existsSync(layoutPath), true, "缺少會員方案正式版面 owner");

  const router = readFileSync(routerPath, "utf8");
  const dotsCss = readFileSync(overridePath, "utf8");
  const layoutCss = readFileSync(layoutPath, "utf8");
  const mobileLayoutCss = readFileSync(mobileLayoutPath, "utf8");

  assert.match(router, /import\s+["']\.\/pro-plans-layout\.css["'];/);
  assert.match(router, /import\s+["']\.\/pro-plans-carousel-peek\.css["'];/);
  assert.match(layoutCss, /\.pro-plans-screen\s*\{[^}]*--pro-plans-plan-inline:\s*25px;[^}]*--pro-plans-checkout-inline:\s*16px;/s);
  assert.match(layoutCss, /\.pro-plans-screen\s+\.plan-carousel\s*\{[^}]*width:\s*100%;[^}]*margin:\s*0;[^}]*padding:\s*0\s+var\(--pro-plans-plan-inline\)\s+18px;[^}]*scroll-padding-inline:\s*var\(--pro-plans-plan-inline\);[^}]*gap:\s*13px;/s);
  assert.match(layoutCss, /\.pro-plans-screen\s+\.plan-card\s*\{[^}]*flex:\s*0\s+0\s+100%;/s);
  assert.match(layoutCss, /\.pro-plans-screen\s+\.pro-plans-checkout\s*\{[^}]*margin-inline:\s*var\(--pro-plans-checkout-inline\);/s);
  assert.doesNotMatch(layoutCss, /flex:\s*0\s+0\s+calc\(100%|margin-inline:\s*-[\d.]+px|width:\s*calc\(100%\s*\+|transform:\s*translateX/);
  assert.doesNotMatch(mobileLayoutCss, /\.pro-plans-screen/);

  for (const index of [0, 1, 2]) {
    assert.match(
      dotsCss,
      new RegExp(`\\.pro-plans-screen\\s+\\.plan-carousel:has\\(\\.plan-card\\[data-current=["']true["']\\]\\[data-plan-index=["']${index}["']\\]\\)`),
      `缺少第 ${index + 1} 個方案的分頁指示狀態`,
    );
  }
});
