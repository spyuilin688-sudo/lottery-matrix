import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../src/FeaturePages.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../src/responsive-feature-pages.css", import.meta.url), "utf8");

test("號碼對照單標題操作保持左側刷新，並以相對位移調整探索設定", () => {
  const actions = source.match(/<div className="reference-title-actions title-card-compact-actions">([\s\S]*?)<\/div>/)?.[1] ?? "";

  assert.match(actions, /reference-refresh-trigger[\s\S]*刷新/);
  assert.match(actions, /reference-settings-trigger[\s\S]*探索設定/);
  assert.ok(actions.indexOf("reference-refresh-trigger") < actions.indexOf("reference-settings-trigger"));
  assert.match(css, /\.number-reference-screen \.reference-settings-trigger\s*\{[^}]*transform:\s*translate\(-4px, -3px\);/s);
  assert.match(css, /\.title-card-compact-action svg\s*\{[^}]*width:\s*10px;[^}]*height:\s*10px;/s);
  assert.doesNotMatch(css, /\.number-reference-screen \.reference-refresh-trigger > svg\s*\{/);
  assert.doesNotMatch(css, /\.number-reference-screen \.reference-title-actions[^{}]*\.title-card-compact-action\s*\{[^}]*height\s*:/s);
});
