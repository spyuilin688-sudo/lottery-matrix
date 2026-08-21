import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const prototypeSource = readFileSync(new URL("../src/Prototype.tsx", import.meta.url), "utf8");
const featurePagesSource = readFileSync(new URL("../src/FeaturePages.tsx", import.meta.url), "utf8");

test("首頁樂彩 Logo 使用 matrixya.png", () => {
  assert.match(prototypeSource, /logo:\s*"\/assets\/lottery\/functions\/matrixya\.png"/);
});

test("探索頁進階探索設定圖示使用 matrixYY.png", () => {
  assert.match(
    featurePagesSource,
    /className="advanced-row"[\s\S]*?<img src="\/assets\/lottery\/matrixYY\.png" alt="" aria-hidden="true" \/>/,
  );
});
