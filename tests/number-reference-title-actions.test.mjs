import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

test("號碼對照單標題卡只顯示一個刷新與探索設定文字", () => {
  const source = readFileSync(new URL("../src/FeaturePages.tsx", import.meta.url), "utf8");
  const start = source.indexOf('title="號碼對照單"');
  const end = source.indexOf('className="reference-query-panel"', start);
  const header = source.slice(start, end);

  assert.equal((header.match(/刷新<\/button>/g) ?? []).length, 1);
  assert.match(header, /<ReloadIcon className="reference-refresh-icon" \/>/);
  assert.match(header, /探索設定/);
});

test("刷新與探索設定使用標題卡右側 40% 響應式操作區", () => {
  const responsiveCss = readFileSync(new URL("../src/responsive-feature-pages.css", import.meta.url), "utf8");

  assert.match(
    responsiveCss,
    /\.number-reference-screen \.matrix-title-banner-actions\s*\{[^}]*width:\s*40%;/s,
  );
  assert.match(
    responsiveCss,
    /\.title-card-compact-action \.reference-refresh-icon\s*\{[^}]*width:\s*7px;[^}]*height:\s*7px;[^}]*flex:\s*0 0 7px;/s,
  );
});
