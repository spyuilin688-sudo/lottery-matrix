import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

test("號碼對照單標題卡只顯示一個刷新與探索設定文字", () => {
  const source = readFileSync(new URL("../src/FeaturePages.tsx", import.meta.url), "utf8");
  const start = source.indexOf('title="號碼對照單"');
  const end = source.indexOf('className="reference-query-panel"', start);
  const header = source.slice(start, end);

  assert.equal((header.match(/>刷新<\/button>/g) ?? []).length, 1);
  assert.match(header, /探索設定/);
});

test("刷新與探索設定置中於標題卡右半區域", () => {
  const css = readFileSync(new URL("../src/feature-pages.css", import.meta.url), "utf8");

  assert.match(
    css,
    /\.number-reference-screen \.matrix-title-banner-actions\s*\{[^}]*inset:\s*0\s+0\s+0\s+50%;[^}]*align-items:\s*center;[^}]*justify-content:\s*center;/s,
  );
});
