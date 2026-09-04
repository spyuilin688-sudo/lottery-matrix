import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const baseCss = readFileSync("src/matrix-explore-spacing.css", "utf8");
const ownerPath = "src/matrix-explore-result-13px.css";
const mainSource = readFileSync("src/main.tsx", "utf8");

test("13px 結果卡相對 16px 一般內容新增的 6px 全部交給探索與天衍最右欄", () => {
  assert.equal(existsSync(ownerPath), true, "缺少 13px 結果區最終版面 owner");
  const ownerCss = readFileSync(ownerPath, "utf8");
  const owner = ownerCss.match(/\.matrix-explore-main-screen\s*\{([^}]*)\}/s)?.[1] ?? "";
  const resultRows = baseCss.match(/\.matrix-explore-main-screen:not\(\.matrix-tiangong-screen\) \.road-results-head,\s*\.matrix-explore-main-screen:not\(\.matrix-tiangong-screen\) \.road-result-row\s*\{([^}]*)\}/s)?.[1] ?? "";
  const rightCells = baseCss.match(/\.matrix-explore-main-screen:not\(\.matrix-tiangong-screen\) \.road-results-head > :last-child,\s*\.matrix-explore-main-screen:not\(\.matrix-tiangong-screen\) \.road-result-row > :last-child\s*\{([^}]*)\}/s)?.[1] ?? "";

  assert.match(owner, /--matrix-explore-result-panel-extra-width:\s*calc\(var\(--layout-page-inline\) \+ var\(--layout-page-inline\) - 26px\)/);
  assert.match(resultRows, /padding-right:\s*var\(--matrix-explore-result-panel-extra-width\)/);
  assert.match(rightCells, /width:\s*calc\(100% \+ var\(--matrix-explore-result-panel-extra-width\)\)/);
  assert.match(rightCells, /margin-right:\s*calc\(0px - var\(--matrix-explore-result-panel-extra-width\)\)/);
});

test("13px 最終版面 owner 在舊 Matrix spacing 之後載入", () => {
  const baseIndex = mainSource.indexOf('import "./matrix-explore-spacing.css";');
  const ownerIndex = mainSource.indexOf('import "./matrix-explore-result-13px.css";');
  assert.ok(baseIndex >= 0);
  assert.ok(ownerIndex > baseIndex);
});
