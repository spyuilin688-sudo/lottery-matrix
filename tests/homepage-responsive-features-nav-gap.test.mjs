import assert from "node:assert/strict";
import test from "node:test";
import { readLocalCss } from "./helpers/read-local-css.mjs";

const css = readLocalCss("src/homepage-repair.css");

test("首頁五大功能與底部導覽間距依可視高度在 8px 至 12px 間調整", () => {
  assert.match(
    css,
    /\.home-screen \.home-layout\s*\{[^}]*--home-gap-features-nav:\s*clamp\(8px,\s*1\.15dvh,\s*12px\);/s,
  );
});
