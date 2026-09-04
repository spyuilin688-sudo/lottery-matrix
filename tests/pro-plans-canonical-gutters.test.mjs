import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const prototypePath = join(root, "src", "Prototype.tsx");
const patchedRouterPath = join(root, "src", "FeaturePagesPatched.tsx");
const ownerPath = join(root, "src", "pro-plans-layout.css");
const debugPath = join(root, "src", "homepage-debug.css");

const prototypeSource = readFileSync(prototypePath, "utf8");
const patchedRouterSource = readFileSync(patchedRouterPath, "utf8");
const ownerCss = readFileSync(ownerPath, "utf8");

test("正式頁面入口依序載入共用樣式與 Pro 方案 owner", () => {
  const sharedIndex = prototypeSource.indexOf('import "./feature-pages.css";');
  const layoutIndex = prototypeSource.indexOf('import "./pro-plans-layout.css";');
  const dotsIndex = prototypeSource.indexOf('import "./pro-plans-carousel-peek.css";');

  assert.ok(sharedIndex >= 0, "Prototype 缺少共用 feature-pages 樣式");
  assert.ok(layoutIndex > sharedIndex, "Pro 方案版面 owner 必須在共用樣式之後載入");
  assert.ok(dotsIndex > layoutIndex, "Pro 方案分頁指示樣式必須在版面 owner 之後載入");
  assert.doesNotMatch(patchedRouterSource, /import\s+["']\.\/pro-plans-(?:layout|carousel-peek)\.css["'];/);
});

test("方案卡與付款區以實際水平 gutter 擁有 18px 與 16px", () => {
  assert.match(
    ownerCss,
    /\.pro-plans-screen\s+\.plan-carousel\s*\{[^}]*padding:\s*0\s+var\(--pro-plans-plan-inline\)\s+18px;[^}]*scroll-padding-inline:\s*var\(--pro-plans-plan-inline\);/s,
  );
  assert.match(ownerCss, /\.pro-plans-screen\s+\.plan-card\s*\{[^}]*flex:\s*0\s+0\s+100%;/s);
  assert.match(
    ownerCss,
    /\.pro-plans-screen\s+\.pro-plans-checkout\s*\{[^}]*margin-inline:\s*var\(--pro-plans-checkout-inline\);/s,
  );
  assert.doesNotMatch(ownerCss, /calc\(100%\s*-\s*\(var\(--pro-plans-plan-inline\)\s*\*\s*2\)\)/);
});

test("移除未載入的首頁暫時除錯覆寫檔", () => {
  assert.equal(existsSync(debugPath), false);
});
