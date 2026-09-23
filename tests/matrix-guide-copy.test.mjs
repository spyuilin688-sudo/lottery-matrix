import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../src/features/MatrixGuidePage.tsx", import.meta.url), "utf8");

test("Matrix guide uses requested spacing and current opening instructions", () => {
  assert.match(source, /Matrix Core \(Matrix 探索、Matrix 天衡、Matrix 天樞、Matrix 天衍、Matrix 天工\)/);
  assert.ok(source.includes("今彩539與天天樂每期使用 5 個球位；六合彩與大樂透使用 6 個正碼球位及特別號"));
  assert.ok(source.includes("標準範圍：上 1 ~ 7、當期"));
  assert.ok(source.includes("完整範圍：上 1 ~ 14、當期"));
  assert.ok(source.includes("「鎖定 1 碼、鎖定 2 碼」是結果規則的設定"));
  assert.ok(source.includes("標準範圍包含上 1 ~ 7 期"));
  assert.ok(source.includes("完整範圍向上擴大至 14 期"));
  assert.ok(source.includes("命中條件固定為準5+ (鎖定 2 碼)"));
  assert.ok(source.includes("複合版路每組使用 1 個鎖定條件與 2 條規則"));
  assert.ok(source.includes("每條規則各驗證 1 個球位"));
  assert.ok(source.includes("固定使用五十期、二段式與準 2 進 3"));
  assert.ok(source.includes("準 3 進 4 排除"));
  assert.ok(source.includes("輸入 2 至 3 個指定號碼後"));
  assert.ok(source.includes("至少輸入 2 個、最多 3 個號碼"));
  assert.ok(source.includes("可選擇 1 至 30 期"));
  assert.ok(source.includes("今彩539與天天樂顯示 5 個號碼；六合彩與大樂透顯示 6 個號碼及特別號"));
  assert.ok(source.includes("可輸入 0 至 3 個探索號碼"));
  assert.ok(source.includes("點擊底部「快捷」：已設定快捷功能時直接開啟；尚未設定時會先開啟快捷設定。"));
  assert.ok(source.includes("在首頁設定按鈕連續點擊兩下可變更快捷功能。"));
  assert.ok(source.includes("首頁點選查看更多紀錄，可查閱歷史開獎紀錄。"));
});

test("Matrix guide removes stale copy", () => {
  const stale = [
    "Matrix Core（Matrix 探索、Matrix 天衡、Matrix 天衍、Matrix 天工）",
    "今彩539與天天樂每期使用5個球位；六合彩與大樂透使用6個正碼球位及特別號",
    "標準範圍：上1～7、當期",
    "完整範圍：上1～14、當期",
    "「鎖定1碼／2碼」是結果規則的設定",
    "標準範圍包含上1～7期",
    "完整範圍向上擴大至14期",
    "複合版路每組使用1個鎖定條件與2條規則",
    "每條規則各驗證1個球位",
    "固定使用五十期、二段式與準2進3",
    "準3進4排除",
    "輸入2至3個指定號碼後",
    "至少輸入2個、最多3個號碼",
    "可選擇1至30期",
    "今彩539與天天樂顯示5個號碼；六合彩與大樂透顯示6個號碼及特別號",
    "可輸入0至3個探索號碼",
    "點擊底部「快捷」開啟目前設定的功能。",
    "首頁近10期開獎號碼點選查看更多紀錄",
  ];
  for (const phrase of stale) assert.equal(source.includes(phrase), false, phrase);
});
