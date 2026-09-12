import { readFeaturePagesSource } from "./helpers/read-feature-pages-source.mjs";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFeaturePagesSource();
const css = readFileSync(new URL("../src/responsive-feature-pages.css", import.meta.url), "utf8");

test("號碼對照單標題僅保留探索設定，刷新移至設定第一列", () => {
  const actions = source.match(/<div className="reference-title-actions title-card-compact-actions(?: tool-title-actions)?">([\s\S]*?)<\/div>/)?.[1] ?? "";

  assert.doesNotMatch(actions, /reference-refresh-trigger/);
  assert.match(actions, /reference-settings-trigger[\s\S]*探索設定/);
  assert.match(source, /className="query-selects three-cols"[\s\S]*tool-settings-reset reference-refresh-trigger[\s\S]*onClick=\{resetReference\}/);
  assert.doesNotMatch(css, /\.number-reference-screen \.reference-settings-trigger\s*\{[^}]*transform\s*:/s);
  assert.match(css, /\.title-card-compact-action svg\s*\{[^}]*width:\s*10px;[^}]*height:\s*10px;/s);
  assert.doesNotMatch(css, /\.number-reference-screen \.reference-refresh-trigger > svg\s*\{/);
  assert.doesNotMatch(css, /\.number-reference-screen \.reference-title-actions[^{}]*\.title-card-compact-action\s*\{[^}]*height\s*:/s);
});
