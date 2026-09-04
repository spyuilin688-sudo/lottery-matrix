import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const css = readFileSync("src/matrix-explore-spacing.css", "utf8");
const tokens = readFileSync("src/design-tokens.css", "utf8");

test("Matrix 探索、天衍、天工的一般內容維持 16px 左右間距", () => {
  const content = css.match(/\.matrix-explore-screen \.feature-body > :not\(\.result-panel\),\s*\.matrix-explore-screen \.feature-body > \.matrix-explore-history-scope \.history-panel\s*\{([^}]*)\}/s)?.[1] ?? "";

  assert.match(tokens, /--layout-page-inline:\s*16px;/);
  assert.match(content, /width:\s*auto;/);
  assert.match(content, /margin-inline:\s*3px;/);
  assert.doesNotMatch(content, /width:\s*calc\(/);
  assert.doesNotMatch(css, /margin(?:-[a-z]+)?:\s*-\d/);
});

test("Matrix 探索、天衍、天工的探索結果區外框為 13px", () => {
  const resultRules = [...css.matchAll(/\.matrix-explore-main-screen \.feature-body > \.result-panel\s*\{([^}]*)\}/gs)];
  const screen = css.match(/\.matrix-explore-screen \.feature-body\s*\{([^}]*)}/s)?.[1] ?? "";
  const result = resultRules.at(-1)?.[1] ?? "";

  assert.match(screen, /padding-inline:\s*13px;/);
  assert.match(result, /--matrix-explore-result-panel-width:\s*100%;/);
});
