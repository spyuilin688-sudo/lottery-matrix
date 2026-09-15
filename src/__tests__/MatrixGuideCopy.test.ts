import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("../features/MatrixGuidePage.tsx", import.meta.url), "utf8");

describe("Matrix guide copy", () => {
  it("uses the requested spacing and current opening instructions", () => {
    expect(source).toContain("Matrix Core (Matrix 探索、Matrix 天衡、Matrix 天衍、Matrix 天工)");
    expect(source).toContain("今彩539與天天樂每期使用 5 個球位；六合彩與大樂透使用 6 個正碼球位及特別號");
    expect(source).toContain("標準範圍：上 1 ~ 7、當期");
    expect(source).toContain("完整範圍：上 1 ~ 14、當期");
    expect(source).toContain("「鎖定 1 碼、鎖定 2 碼」是結果規則的設定");
    expect(source).toContain("標準範圍包含上 1 ~ 7 期");
    expect(source).toContain("完整範圍向上擴大至 14 期");
    expect(source).toContain("命中條件固定為準5+ (鎖定 2 碼)");
    expect(source).toContain("複合版路每組使用 1 個鎖定條件與 2 條規則");
    expect(source).toContain("每條規則各驗證 1 個球位");
    expect(source).toContain("固定使用五十期、二段式與準 2 進 3");
    expect(source).toContain("準 3 進 4 排除");
    expect(source).toContain("輸入 2 至 3 個指定號碼後");
    expect(source).toContain("至少輸入 2 個、最多 3 個號碼");
    expect(source).toContain("可選擇 1 至 30 期");
    expect(source).toContain("今彩539與天天樂顯示 5 個號碼；六合彩與大樂透顯示 6 個號碼及特別號");
    expect(source).toContain("可輸入 0 至 3 個探索號碼");
    expect(source).toContain("點擊底部「快捷」：已設定快捷功能時直接開啟；尚未設定時會先開啟快捷設定。");
    expect(source).toContain("在首頁設定按鈕連續點擊兩下可變更快捷功能。");
    expect(source).toContain("首頁點選「查看更多紀錄」，可查閱歷史開獎號碼。");
  });

  it("removes stale guide phrases", () => {
    expect(source).not.toContain("Matrix Core（Matrix 探索、Matrix 天衡、Matrix 天衍、Matrix 天工）");
    expect(source).not.toContain("今彩539與天天樂每期使用5個球位；六合彩與大樂透使用6個正碼球位及特別號");
    expect(source).not.toContain("標準範圍：上1～7、當期");
    expect(source).not.toContain("完整範圍：上1～14、當期");
    expect(source).not.toContain("「鎖定1碼／2碼」是結果規則的設定");
    expect(source).not.toContain("標準範圍包含上1～7期");
    expect(source).not.toContain("完整範圍向上擴大至14期");
    expect(source).not.toContain("複合版路每組使用1個鎖定條件與2條規則");
    expect(source).not.toContain("每條規則各驗證1個球位");
    expect(source).not.toContain("固定使用五十期、二段式與準2進3");
    expect(source).not.toContain("準3進4排除");
    expect(source).not.toContain("輸入2至3個指定號碼後");
    expect(source).not.toContain("至少輸入2個、最多3個號碼");
    expect(source).not.toContain("可選擇1至30期");
    expect(source).not.toContain("今彩539與天天樂顯示5個號碼；六合彩與大樂透顯示6個號碼及特別號");
    expect(source).not.toContain("可輸入0至3個探索號碼");
    expect(source).not.toContain("點擊底部「快捷」開啟目前設定的功能。");
    expect(source).not.toContain("首頁近10期開獎號碼點選查看更多紀錄");
  });
});
