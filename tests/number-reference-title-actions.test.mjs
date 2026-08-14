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
