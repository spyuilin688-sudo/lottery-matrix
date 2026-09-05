import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.cwd();
const srcRoot = join(root, "src");
const prototypePath = join(srcRoot, "Prototype.tsx");
const patchedRouterPath = join(srcRoot, "FeaturePagesPatched.tsx");
const ownerPath = join(srcRoot, "pro-plans-layout.css");
const debugPath = join(srcRoot, "homepage-debug.css");

const prototypeSource = readFileSync(prototypePath, "utf8");
const patchedRouterSource = readFileSync(patchedRouterPath, "utf8");
const ownerCss = readFileSync(ownerPath, "utf8");

function listSourceFiles(directory) {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) return listSourceFiles(path);
    return /\.(?:ts|tsx|js|jsx)$/.test(name) ? [path] : [];
  });
}

test("正式入口先載入共用樣式，Pro 方案樣式只有一個匯入 owner", () => {
  const sharedIndex = prototypeSource.indexOf('import "./feature-pages.css";');
  const patchedRouterIndex = prototypeSource.indexOf('import("./FeaturePagesPatched")');
  const layoutIndex = prototypeSource.indexOf('import "./pro-plans-layout.css";');
  const dotsIndex = prototypeSource.indexOf('import "./pro-plans-carousel-peek.css";');

  assert.ok(sharedIndex >= 0, "Prototype 缺少共用 feature-pages 樣式");
  assert.ok(patchedRouterIndex > sharedIndex, "正式入口必須先載入共用樣式，再載入 patched router");
  assert.ok(layoutIndex >= 0, "patched router 缺少 Pro 方案版面 owner");
  assert.ok(dotsIndex > layoutIndex, "Pro 方案分頁指示樣式必須在版面 owner 之後載入");

  const layoutOwners = listSourceFiles(srcRoot)
    .filter((path) => readFileSync(path, "utf8").includes('import "./pro-plans-layout.css";'))
    .map((path) => relative(root, path).replaceAll("\\", "/"));
  const dotsOwners = listSourceFiles(srcRoot)
    .filter((path) => readFileSync(path, "utf8").includes('import "./pro-plans-carousel-peek.css";'))
    .map((path) => relative(root, path).replaceAll("\\", "/"));

  assert.deepEqual(layoutOwners, ["src/Prototype.tsx"]);
  assert.deepEqual(dotsOwners, ["src/Prototype.tsx"]);
});

test("方案卡與付款區以實際水平 gutter 擁有 19px 與 16px", () => {
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
