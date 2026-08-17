from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected 1 match, got {count}")
    return text.replace(old, new, 1)


def replace_between(text: str, start_marker: str, end_marker: str, replacement: str, label: str) -> str:
    start = text.find(start_marker)
    if start < 0:
        raise RuntimeError(f"{label}: start marker not found")
    end = text.find(end_marker, start)
    if end < 0:
        raise RuntimeError(f"{label}: end marker not found")
    return text[:start] + replacement.rstrip() + "\n" + text[end:]


def write_tests() -> None:
    draw_test = r'''import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const css = readFileSync(new URL("../src/feature-pages.css", import.meta.url), "utf8");
const ballCss = readFileSync(new URL("../src/number-ball.css", import.meta.url), "utf8");
const source = readFileSync(new URL("../src/FeaturePages.tsx", import.meta.url), "utf8");

test("上傳規格：彩種下拉位於篩選第一項且舊標題列彩種控制已移除", () => {
  const fieldsStart = source.indexOf('<div className="history-filter-fields">');
  const lotteryIcon = source.indexOf('/assets/lottery/functions/彩種.png', fieldsStart);
  const lotterySelect = source.indexOf('aria-label="彩種"', fieldsStart);
  const issueIcon = source.indexOf('/assets/history-filter/issue.png', fieldsStart);
  assert.ok(fieldsStart >= 0);
  assert.ok(lotteryIcon > fieldsStart && lotteryIcon < issueIcon);
  assert.ok(lotterySelect > fieldsStart && lotterySelect < issueIcon);
  assert.doesNotMatch(source, /history-title-lottery|history-title-chevron/);
  assert.doesNotMatch(css, /history-title-lottery|history-title-chevron/);
});

test("上傳規格：歷史篩選使用獨立單一 backdrop 與 sheet 控制來源", () => {
  assert.match(source, /className="history-filter-backdrop"/);
  assert.match(source, /className="history-filter-sheet"/);
  assert.doesNotMatch(source, /className="filter-sheet-backdrop"[^>]*history-filter/);
  assert.doesNotMatch(source, /className="filter-sheet history-filter-sheet"/);
  assert.match(css, /\.history-filter-backdrop\s*\{[^}]*padding:\s*0 12px[^}]*background:\s*rgba\(0, 0, 0, \.71\)/s);
  assert.match(css, /\.history-filter-sheet\s*\{[^}]*width:\s*100%[^}]*padding:\s*16px[^}]*border-radius:\s*16px[^}]*font-family:\s*system-ui/s);
});

test("上傳規格：篩選標題、圖示與欄位尺寸一致", () => {
  assert.match(css, /\.history-filter-sheet > header\s*\{[^}]*min-height:\s*44px[^}]*justify-content:\s*flex-start/s);
  assert.match(css, /\.history-filter-sheet > header button\s*\{[^}]*width:\s*44px[^}]*height:\s*44px/s);
  assert.match(css, /\.history-filter-sheet > header svg\s*\{[^}]*width:\s*24px[^}]*height:\s*24px/s);
  assert.match(css, /\.history-filter-sheet h2\s*\{[^}]*font-size:\s*22px[^}]*font-weight:\s*700/s);
  assert.match(css, /\.history-filter-fields\s*\{[^}]*margin-top:\s*12px[^}]*gap:\s*12px/s);
  assert.match(css, /\.history-filter-row\s*\{[^}]*min-height:\s*48px[^}]*grid-template-columns:\s*48px minmax\(0, 1fr\)[^}]*gap:\s*10px/s);
  assert.match(css, /\.history-filter-icon\s*\{[^}]*width:\s*48px[^}]*height:\s*48px/s);
  assert.match(css, /\.history-filter-icon img\s*\{[^}]*width:\s*48px[^}]*height:\s*48px/s);
  assert.match(css, /\.history-filter-fields input\s*\{[^}]*height:\s*44px[^}]*padding:\s*0 12px[^}]*font-size:\s*16px[^}]*font-weight:\s*500[^}]*text-align:\s*left/s);
});

test("上傳規格：日期、號碼順序、探索範圍與底部按鈕尺寸正確", () => {
  assert.match(css, /\.history-date-selects\s*\{[^}]*grid-template-columns:\s*100px 1fr 1fr[^}]*gap:\s*6px/s);
  assert.match(css, /\.history-date-selects \.select-box\s*\{[^}]*height:\s*44px/s);
  assert.match(css, /\.history-date-selects select\s*\{[^}]*font-size:\s*16px[^}]*font-weight:\s*500/s);
  assert.match(css, /\.history-date-selects svg\s*\{[^}]*right:\s*10px[^}]*width:\s*14px[^}]*height:\s*14px/s);
  assert.match(css, /\.history-order-select\s*\{[^}]*height:\s*44px/s);
  assert.match(css, /\.history-order-select select\s*\{[^}]*font-size:\s*15px[^}]*font-weight:\s*600/s);
  assert.match(css, /\.history-range-options button\s*\{[^}]*height:\s*44px[^}]*border-radius:\s*9px[^}]*font-size:\s*13px[^}]*font-weight:\s*600/s);
  assert.match(css, /\.history-range-options button\[data-selected="true"\]\s*\{[^}]*box-shadow:\s*none/s);
  assert.match(css, /\.history-filter-actions\s*\{[^}]*grid-template-columns:\s*112px minmax\(0, 1fr\)[^}]*gap:\s*8px/s);
  assert.match(css, /\.history-filter-actions button\s*\{[^}]*height:\s*48px[^}]*border-radius:\s*10px/s);
  assert.match(css, /\.history-filter-actions button:first-child\s*\{[^}]*font-size:\s*17px[^}]*font-weight:\s*700/s);
  assert.match(css, /\.history-filter-actions button:last-child\s*\{[^}]*font-size:\s*18px[^}]*font-weight:\s*700[^}]*box-shadow:\s*none/s);
});

test("上傳規格：歷史表格使用 366 寬、17/17/66 欄比、38/56 高度與單一外框", () => {
  assert.match(source, /<section className="draw-history-panel" key=\{firstIssue\}>/);
  assert.doesNotMatch(source, /className="panel draw-history-panel"/);
  assert.match(css, /\.draw-history-panel\s*\{[^}]*width:\s*100%[^}]*max-width:\s*366px[^}]*overflow:\s*hidden[^}]*border:\s*1px solid rgba\(156, 111, 38, \.58\)[^}]*border-radius:\s*14px[^}]*box-shadow:\s*none/s);
  assert.match(css, /\.draw-history-row\s*\{[^}]*height:\s*56px[^}]*grid-template-columns:\s*17% 17% 66%[^}]*border-top:\s*1px solid rgba\(126, 91, 39, \.28\)/s);
  assert.match(css, /\.draw-history-head\s*\{[^}]*height:\s*38px[^}]*border-bottom:\s*1px solid rgba\(195, 145, 54, \.68\)[^}]*font-size:\s*15px[^}]*font-weight:\s*700/s);
  assert.match(css, /\.draw-history-row > span \+ span\s*\{[^}]*border-left:\s*1px solid rgba\(126, 91, 39, \.28\)/s);
  assert.match(css, /\.draw-history-week-list\s*\{[^}]*gap:\s*8px[^}]*font-family:\s*system-ui/s);
});

test("上傳規格：期數與日期字級層級符合規格", () => {
  assert.match(css, /\.draw-history-row \.draw-history-meta:first-child\s*\{[^}]*font-size:\s*14px[^}]*font-weight:\s*700[^}]*letter-spacing:\s*\.25px[^}]*font-variant-numeric:\s*tabular-nums/s);
  assert.match(css, /\.draw-history-screen \.history-date-stack strong\s*\{[^}]*font-size:\s*13px[^}]*font-weight:\s*700[^}]*line-height:\s*16px/s);
  assert.match(css, /\.draw-history-screen \.history-date-stack small\s*\{[^}]*font-size:\s*12px[^}]*font-weight:\s*500[^}]*line-height:\s*16px/s);
});

test("上傳規格：五球 30px，六加一 28px，球號 12px", () => {
  assert.match(ballCss, /\.draw-history-screen \.draw-history-row \.number-ball-component\.history-lottery-ball:is\(\[data-lottery="今彩539"\], \[data-lottery="天天樂"\]\)\s*\{[^}]*--number-ball-size:\s*30px[^}]*--number-font-size:\s*12px/s);
  assert.match(ballCss, /\.draw-history-screen \.draw-history-row \.number-ball-component\.history-lottery-ball:is\(\[data-lottery="六合彩"\], \[data-lottery="大樂透"\]\)\s*\{[^}]*--number-ball-size:\s*28px[^}]*--number-font-size:\s*12px[^}]*--underline-height:\s*\.5px[^}]*--underline-y:\s*\.5px/s);
  assert.doesNotMatch(ballCss, /\.draw-history-screen[^{}]*history-lottery-ball\[data-lottery="六合彩"\]\s*\{/);
  assert.doesNotMatch(ballCss, /\.draw-history-screen[^{}]*history-lottery-ball\[data-lottery="大樂透"\]\s*\{/);
});

test("上傳規格：五球與六加一採固定間距，特別號不用負位移", () => {
  assert.match(css, /\.draw-history-screen \.draw-history-row \.history-main-numbers\s*\{[^}]*gap:\s*5px/s);
  assert.match(css, /\.draw-history-screen \.draw-history-row \.history-numbers\[data-has-special="true"\] \.history-main-numbers\s*\{[^}]*gap:\s*2px[^}]*padding-top:\s*10px/s);
  assert.match(css, /\.draw-history-screen \.history-special-number\s*\{[^}]*height:\s*38px[^}]*margin-left:\s*2px[^}]*gap:\s*2px/s);
  assert.match(css, /\.draw-history-screen \.history-special-ball\s*\{[^}]*height:\s*38px[^}]*grid-template-rows:\s*10px 28px/s);
  assert.match(css, /\.draw-history-screen \.history-special-label\s*\{[^}]*font-size:\s*9px[^}]*font-weight:\s*600[^}]*line-height:\s*10px/s);
  assert.match(css, /\.draw-history-screen \.history-special-plus\s*\{[^}]*width:\s*14px[^}]*height:\s*28px[^}]*font-size:\s*14px/s);
  assert.doesNotMatch(css, /\.draw-history-screen[^{}]*history-special-label[^{}]*transform\s*:/);
});
'''
    (ROOT / "tests/draw-history-table-layout.test.mjs").write_text(draw_test, encoding="utf-8")

    structure_test = r'''import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../src/FeaturePages.tsx", import.meta.url), "utf8");

test("歷史開獎分頁資料依曆週分組並使用歷史頁單一資訊卡樣式來源", () => {
  assert.match(source, /groupHistoryByCalendarWeek\(paginatedHistory\.items\)/);
  assert.match(source, /historyWeekGroups\.map\(\(weekRecords\)/);
  assert.match(source, /className="draw-history-panel"/);
  assert.doesNotMatch(source, /className="panel draw-history-panel"/);
});

test("歷史篩選開啟時鎖定背景捲動並以 portal 覆蓋目前頁面", () => {
  assert.match(source, /if \(!filterOpen\) return;/);
  assert.match(source, /mobilePage\.style\.overflow = "hidden"/);
  assert.match(source, /createPortal\([\s\S]*className="history-filter-backdrop"/);
  assert.match(source, /aria-modal="true"/);
});
'''
    (ROOT / "tests/draw-history-week-cards-structure.test.mjs").write_text(structure_test, encoding="utf-8")

    source_test = r'''import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const src = new URL("src/", root);

test("NumberBall visual rules have one formal CSS source", async () => {
  const cssFiles = (await readdir(src)).filter((name) => name.endsWith(".css"));
  const forbiddenRule = /(?:\.number-ball(?:-component|-asset|-value)?\b|\.history-lottery-ball\b|\.ball-(?:surface|number)\b|--number-ball-size\s*:|--number-font-size\s*:|--underline-(?:width|height|y)\s*:)/;
  const offenders = [];
  for (const name of cssFiles) {
    if (name === "number-ball.css") continue;
    const content = await readFile(new URL(`src/${name}`, root), "utf8");
    if (forbiddenRule.test(content)) offenders.push(name);
  }
  assert.deepEqual(offenders, []);
});

test("legacy NumberBall bridge is removed", async () => {
  await assert.rejects(access(new URL("src/number-ball-bridge.css", root)));
});

test("shared special-ball geometry is declared by number-ball.css", async () => {
  const formal = await readFile(new URL("src/number-ball.css", root), "utf8");
  const homepage = await readFile(new URL("src/homepage-repair.css", root), "utf8");
  assert.match(formal, /\.home-screen \.latest-draw-card\s*\{[^}]*--draw-special-ball-size:/s);
  assert.doesNotMatch(homepage, /--draw-special-ball-size\s*:/);
});

test("六合彩首頁既有底線規則維持，歷史頁與大樂透共用新規格", async () => {
  const formal = await readFile(new URL("src/number-ball.css", root), "utf8");
  assert.match(formal, /\.home-screen[^}]*data-lottery="六合彩"[^}]*--underline-y:\s*-1\.5px/s);
  assert.match(formal, /\.draw-history-screen[^{}]*:is\(\[data-lottery="六合彩"\], \[data-lottery="大樂透"\]\)[^{]*\{[^}]*--number-ball-size:\s*28px[^}]*--number-font-size:\s*12px[^}]*--number-y:\s*0px[^}]*--underline-width:\s*12px[^}]*--underline-height:\s*\.5px[^}]*--underline-y:\s*\.5px/s);
  assert.doesNotMatch(formal, /\.draw-history-screen[^{}]*history-lottery-ball\[data-lottery="六合彩"\]\s*\{/);
  assert.doesNotMatch(formal, /\.draw-history-screen[^{}]*history-lottery-ball\[data-lottery="大樂透"\]\s*\{/);
});
'''
    (ROOT / "tests/number-ball-style-source.test.mjs").write_text(source_test, encoding="utf-8")

    visible_test = r'''import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const css = await readFile(new URL("../src/number-ball.css", import.meta.url), "utf8");

test("transparent PNG canvases are compensated inside NumberBall", () => {
  assert.match(css, /\.number-ball-asset\s*\{[\s\S]*width:\s*calc\(100% \* var\(--number-ball-asset-scale\)\)/);
  assert.match(css, /data-lottery="今彩539"[\s\S]*--number-ball-asset-scale:\s*1\.228/);
  assert.match(css, /data-lottery="天天樂"[\s\S]*--number-ball-asset-scale:\s*1\.347/);
  assert.match(css, /data-lottery="六合彩"[\s\S]*--number-ball-asset-scale:\s*1\.478/);
  assert.match(css, /data-lottery="大樂透"[\s\S]*--number-ball-asset-scale:\s*1\.478/);
});
'''
    (ROOT / "tests/number-ball-visible-size.test.mjs").write_text(visible_test, encoding="utf-8")


def apply_feature_pages() -> None:
    path = ROOT / "src/FeaturePages.tsx"
    text = path.read_text(encoding="utf-8")
    text = replace_once(
        text,
        '<section className="panel draw-history-panel" key={firstIssue}>',
        '<section className="draw-history-panel" key={firstIssue}>',
        "history panel class",
    )
    old = '''            <div className="filter-sheet-backdrop" role="presentation" onClick={() => setFilterOpen(false)}>
              <section
                className="filter-sheet history-filter-sheet"'''
    new = '''            <div className="history-filter-backdrop" role="presentation" onClick={() => setFilterOpen(false)}>
              <section
                className="history-filter-sheet"'''
    text = replace_once(text, old, new, "history filter classes")
    path.write_text(text, encoding="utf-8")


def apply_feature_css() -> None:
    path = ROOT / "src/feature-pages.css"
    text = path.read_text(encoding="utf-8")

    draw_block = r'''.draw-history-screen .draw-history-row .history-numbers,
.draw-history-screen .draw-history-row .history-main-numbers,
.draw-history-screen .draw-history-row .history-special-number {
  gap: 0;
}

.draw-history-screen .draw-history-row .history-main-numbers { gap: 5px; }

.draw-history-screen .draw-history-row .history-numbers:not([data-has-special="true"]) {
  justify-content: center;
}

.draw-history-screen .draw-history-row .history-numbers[data-has-special="true"] {
  justify-content: center;
  align-items: center;
}

.draw-history-screen .draw-history-row .history-numbers[data-has-special="true"] .history-main-numbers {
  gap: 2px;
  padding-top: 10px;
}

.draw-history-screen .draw-history-row .history-special-number {
  height: 38px;
  margin-left: 2px;
  gap: 2px;
  align-items: flex-end;
}

.draw-history-screen .matrix-title-banner { margin-bottom: 8px; }
.draw-history-screen .matrix-title-banner-actions { top: 20%; right: 8%; bottom: 20%; left: auto; width: 46%; height: auto; }
.draw-history-screen .matrix-title-banner-actions .history-title-actions {
  width: 100%;
  height: 100%;
  justify-content: flex-end;
  font-family: system-ui, -apple-system, BlinkMacSystemFont, "Noto Sans TC", "PingFang TC", "Microsoft JhengHei", sans-serif;
}
.draw-history-screen .history-title-actions .history-filter-trigger { min-width: 68px; min-height: 26px; height: 26px; flex: 0 0 68px; padding-inline: 3px; justify-content: center; gap: 3px; font-size: 9px; }
.draw-history-week-list {
  display: grid;
  gap: 8px;
  font-family: system-ui, -apple-system, BlinkMacSystemFont, "Noto Sans TC", "PingFang TC", "Microsoft JhengHei", sans-serif;
}
.draw-history-panel {
  box-sizing: border-box;
  width: 100%;
  max-width: 366px;
  margin-inline: auto;
  padding: 0;
  overflow: hidden;
  border: 1px solid rgba(156, 111, 38, .58);
  border-radius: 14px;
  background: linear-gradient(145deg, rgba(8, 16, 22, .96), rgba(2, 8, 13, .98));
  box-shadow: none;
}
.draw-history-row {
  display: grid;
  height: 56px;
  min-height: 56px;
  grid-template-columns: 17% 17% 66%;
  align-items: center;
  border-top: 1px solid rgba(126, 91, 39, .28);
  color: #bcb7ae;
  font-size: 12px;
  text-align: center;
  box-sizing: border-box;
}
.draw-history-row:first-child { border-top: 0; }
.draw-history-head + .draw-history-row { border-top: 0; }
.draw-history-row > span { display: grid; min-width: 0; height: 100%; padding: 0; place-items: center; box-sizing: border-box; }
.draw-history-row > span + span { border-left: 1px solid rgba(126, 91, 39, .28); }
.draw-history-row > .history-numbers { display: flex; }
.draw-history-head {
  height: 38px;
  min-height: 38px;
  padding-inline: 4px;
  border-bottom: 1px solid rgba(195, 145, 54, .68);
  color: #d9ad42;
  font-size: 15px;
  font-weight: 700;
  line-height: 20px;
}
.draw-history-row .draw-history-meta:first-child {
  width: 100%;
  padding-inline: 4px;
  font-size: 14px;
  font-weight: 700;
  letter-spacing: .25px;
  text-align: center;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
.draw-history-row .draw-history-meta:nth-child(2) { padding-inline: 3px; }
.draw-history-screen .history-date-stack { display: flex; flex-direction: column; align-items: center; justify-content: center; line-height: 1; }
.draw-history-screen .history-date-stack strong { color: #f1eee8; font-size: 13px; font-weight: 700; line-height: 16px; }
.draw-history-screen .history-date-stack small { margin-top: 0; color: #c7c1b8; font-size: 12px; font-weight: 500; line-height: 16px; white-space: nowrap; }
.draw-history-row .history-numbers { padding: 0 6px; }
.draw-history-screen .history-special-ball { height: 38px; grid-template-rows: 10px 28px; }
.draw-history-screen .history-special-label {
  margin: 0;
  color: #d4a63b;
  font-size: 9px;
  font-weight: 600;
  line-height: 10px;
  white-space: nowrap;
}
.draw-history-screen .history-special-plus {
  display: grid;
  width: 14px;
  height: 28px;
  place-items: center;
  font-size: 14px;
  font-weight: 700;
  line-height: 1;
}
'''
    text = replace_between(
        text,
        ".draw-history-screen .draw-history-row .history-numbers,",
        ".history-pagination {",
        draw_block,
        "draw history layout block",
    )

    filter_block = r'''.history-filter-backdrop {
  position: absolute;
  z-index: 80;
  inset: 0;
  display: flex;
  padding: 0 12px calc(58px + var(--mobile-safe-area-height));
  align-items: flex-end;
  background: rgba(0, 0, 0, .71);
  overscroll-behavior: contain;
  touch-action: none;
}
.history-filter-sheet {
  width: 100%;
  padding: 16px;
  border: 1px solid #9b6c1d;
  border-radius: 16px;
  background: linear-gradient(155deg, #0b151d, #03090e);
  color: #f5f2ea;
  box-shadow: none;
  font-family: system-ui, -apple-system, BlinkMacSystemFont, "Noto Sans TC", "PingFang TC", "Microsoft JhengHei", sans-serif;
  box-sizing: border-box;
}
.history-filter-sheet > header {
  position: relative;
  display: flex;
  min-height: 44px;
  align-items: center;
  justify-content: flex-start;
}
.history-filter-sheet > header button {
  position: absolute;
  right: 0;
  display: grid;
  width: 44px;
  height: 44px;
  padding: 0;
  place-items: center;
  border: 0;
  background: transparent;
  color: #e7ad22;
}
.history-filter-sheet > header svg { width: 24px; height: 24px; }
.history-filter-sheet h2 { margin: 0; color: #f1c94f; font-size: 22px; font-weight: 700; line-height: 1; }
.history-filter-fields { display: grid; margin-top: 12px; gap: 12px; }
.history-filter-fields label,
.history-filter-row {
  display: grid;
  min-height: 48px;
  grid-template-columns: 48px minmax(0, 1fr);
  align-items: center;
  gap: 10px;
}
.history-filter-fields label > span,
.history-filter-fields legend,
.history-filter-row > span { color: #d9c9a6; font-size: 14px; font-weight: 600; }
.history-filter-icon {
  display: grid;
  width: 48px;
  height: 48px;
  place-items: center;
  overflow: hidden;
  border: 1px solid #74521c;
  border-radius: 10px;
  background: #030507;
  box-sizing: border-box;
}
.history-filter-icon img { display: block; width: 48px; height: 48px; object-fit: contain; }
.history-filter-fields input {
  min-width: 0;
  height: 44px;
  padding: 0 12px;
  border: 1px solid #b98723;
  border-radius: 8px;
  outline: 0;
  background: #07131d;
  color: #efe8dc;
  font-size: 16px;
  font-weight: 500;
  text-align: left;
  box-sizing: border-box;
}
.history-filter-fields fieldset { min-width: 0; margin: 0; padding: 0; border: 0; }
.history-filter-fields legend { margin-bottom: 8px; }
.history-filter-sheet .select-box {
  height: 44px;
  border: 1px solid #b98723;
  border-radius: 8px;
  background: #07131d;
  box-sizing: border-box;
}
.history-filter-sheet .select-box::before,
.history-filter-sheet .select-box::after { display: none; }
.history-filter-row > .native-select select { font-size: 16px; font-weight: 500; }
.history-date-selects { display: grid; grid-template-columns: 100px 1fr 1fr; gap: 6px; }
.history-date-selects .select-box { height: 44px; }
.history-date-selects select { padding: 0 30px 0 6px; font-size: 16px; font-weight: 500; text-align: center; text-align-last: center; }
.history-date-selects option { text-align: center; }
.history-date-selects svg { right: 10px; width: 14px; height: 14px; }
.history-order-select { width: 100%; height: 44px; }
.history-order-select select { padding-inline: 12px 30px; font-size: 15px; font-weight: 600; text-align: center; text-align-last: center; }
.history-order-select svg { right: 10px; width: 14px; height: 14px; }
.history-range-options { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 6px; }
.history-range-options button {
  height: 44px;
  min-height: 44px;
  padding: 0 4px;
  border: 1px solid rgba(166, 124, 54, .5);
  border-radius: 9px;
  background: #050b10;
  color: #aaa7a2;
  font-size: 13px;
  font-weight: 600;
  line-height: 1;
  white-space: nowrap;
}
.history-range-options button[data-selected="true"] {
  border-color: #c89622;
  background: rgba(124, 85, 12, .22);
  color: #f2cf67;
  box-shadow: none;
}
.history-filter-actions { display: grid; margin-top: 16px; grid-template-columns: 112px minmax(0, 1fr); gap: 8px; }
.history-filter-actions button {
  height: 48px;
  border: 1px solid #8f6824;
  border-radius: 10px;
  background: #071018;
  color: #d4b969;
}
.history-filter-actions button:first-child { font-size: 17px; font-weight: 700; }
.history-filter-actions button:last-child {
  border-color: #c99a2e;
  background: linear-gradient(135deg, #efbf4f, #c9800c);
  color: #17120a;
  font-size: 18px;
  font-weight: 700;
  box-shadow: none;
}
'''
    text = replace_between(
        text,
        ".history-filter-sheet { padding-bottom: 18px; }",
        ".mini-ball {",
        filter_block,
        "history filter block",
    )
    path.write_text(text, encoding="utf-8")


def apply_number_ball_css() -> None:
    path = ROOT / "src/number-ball.css"
    text = path.read_text(encoding="utf-8")
    start_marker = ".draw-history-screen .draw-history-row .number-ball-component.history-lottery-ball {"
    start = text.find(start_marker)
    if start < 0:
        raise RuntimeError("draw history NumberBall block not found")
    new = r'''.draw-history-screen .draw-history-row .number-ball-component.history-lottery-ball {
  --underline-width: 12px;
  --underline-height: 1px;
}

.draw-history-screen .draw-history-row .number-ball-component.history-lottery-ball:is([data-lottery="今彩539"], [data-lottery="天天樂"]) {
  --number-ball-size: 30px;
  --number-font-size: 12px;
  --number-y: 0px;
}

.draw-history-screen .draw-history-row .number-ball-component.history-lottery-ball[data-lottery="今彩539"] {
  --underline-width: 14px;
  --underline-y: -.5px;
}

.draw-history-screen .draw-history-row .number-ball-component.history-lottery-ball[data-lottery="天天樂"] {
  --underline-y: .25px;
}

.draw-history-screen .draw-history-row .number-ball-component.history-lottery-ball:is([data-lottery="六合彩"], [data-lottery="大樂透"]) {
  --number-ball-size: 28px;
  --number-font-size: 12px;
  --number-y: 0px;
  --underline-width: 12px;
  --underline-height: .5px;
  --underline-y: .5px;
}
'''
    path.write_text(text[:start] + new, encoding="utf-8")


def apply_all() -> None:
    apply_feature_pages()
    apply_feature_css()
    apply_number_ball_css()


if __name__ == "__main__":
    if len(sys.argv) != 2 or sys.argv[1] not in {"--tests", "--apply"}:
        raise SystemExit("usage: apply-history-uploaded-spec.py --tests|--apply")
    if sys.argv[1] == "--tests":
        write_tests()
    else:
        apply_all()
