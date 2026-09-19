import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const tiangong = readFileSync(new URL("../src/features/MatrixTiangongPage.tsx", import.meta.url), "utf8");

test("Matrix 天工固定二段設定顯示現行方形圖示", () => {
  const expected = [
    ["/assets/lottery/functions/探索球位.png", "天工球位"],
    ["/assets/lottery/functions/第一段球位.png", "天工球位"],
    ["/assets/lottery/functions/第二段球位.png", "天工球位"],
    ["/assets/lottery/functions/版路類型.png", "版路類型"],
  ];

  for (const [image, label] of expected) {
    assert.match(
      tiangong,
      new RegExp(`<img[^>]+src=["']${image.replace(/[.*+?^$\{\}()|[\]\\]/g, "\\$&")}["'][^>]*>[^<]*${label}`),
      `缺少 ${label} 的指定圖示`,
    );
  }
  assert.equal((tiangong.match(/aria-label="天工球位"/g) ?? []).length, 3);
  assert.doesNotMatch(tiangong, /命中條件\.png|探索模式/);
});
