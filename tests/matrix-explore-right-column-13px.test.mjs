import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const css = readFileSync("src/matrix-explore-spacing.css", "utf8");

test("13px 結果卡相對 16px 一般內容新增的 6px 全部交給探索與天衍最右欄", () => {
  const screen = css.match(/\.matrix-explore-main-screen\s*\{([^}]*)\}/s)?.[1] ?? "";
  const panelRules = [...css.matchAll(/\.matrix-explore-main-screen \.feature-body > \.result-panel\s*\{([^}]*)\}/gs)];
  const runtimePanel = panelRules.at(-1)?.[1] ?? "";
  const resultRows = css.match(/\.matrix-explore-main-screen:not\(\.matrix-tiangong-screen\) \.road-results-head,\s*\.matrix-explore-main-screen:not\(\.matrix-tiangong-screen\) \.road-result-row\s*\{([^}]*)\}/s)?.[1] ?? "";
  const rightCells = css.match(/\.matrix-explore-main-screen:not\(\.matrix-tiangong-screen\) \.road-results-head > :last-child,\s*\.matrix-explore-main-screen:not\(\.matrix-tiangong-screen\) \.road-result-row > :last-child\s*\{([^}]*)\}/s)?.[1] ?? "";

  assert.match(screen, /--matrix-explore-result-panel-extra-width:\s*calc\(var\(--layout-page-inline\) \+ var\(--layout-page-inline\) - 26px\)/);
  assert.match(runtimePanel, /--matrix-explore-result-panel-width:\s*100%/);
  assert.match(resultRows, /padding-right:\s*var\(--matrix-explore-result-panel-extra-width\)/);
  assert.match(rightCells, /width:\s*calc\(100% \+ var\(--matrix-explore-result-panel-extra-width\)\)/);
  assert.match(rightCells, /margin-right:\s*calc\(0px - var\(--matrix-explore-result-panel-extra-width\)\)/);
});

test("不保留舊 14px 的 4px 寬度公式", () => {
  assert.doesNotMatch(css, /--matrix-explore-result-panel-extra-width:[^;]*- 28px/);
});
