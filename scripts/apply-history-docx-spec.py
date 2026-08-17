from pathlib import Path
import re
import sys

TEST_CONTENT = r'''import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../src/FeaturePages.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../src/feature-pages.css", import.meta.url), "utf8");
const ballCss = readFileSync(new URL("../src/number-ball.css", import.meta.url), "utf8");

test("彩種下拉移入篩選條件第一項並使用正式彩種圖示", () => {
  const fieldsStart = source.indexOf('<div className="history-filter-fields">');
  const lotteryIcon = source.indexOf('/assets/lottery/functions/彩種.png', fieldsStart);
  const lotterySelect = source.indexOf('aria-label="彩種"', fieldsStart);
  const issueIcon = source.indexOf('/assets/history-filter/issue.png', fieldsStart);
  assert.ok(fieldsStart >= 0);
  assert.ok(lotteryIcon > fieldsStart && lotteryIcon < issueIcon);
  assert.ok(lotterySelect > fieldsStart && lotterySelect < issueIcon);
  assert.doesNotMatch(source, /history-title-lottery/);
  assert.match(source, /className="panel history-control-row"[\s\S]*className="history-filter-trigger"/);
});

test("歷史頁控制列使用文件指定高度與間距", () => {
  assert.match(css, /\.history-control-row\s*\{[^}]*width:\s*366px[^}]*height:\s*52px[^}]*margin:\s*0 0 12px[^}]*padding:\s*6px 8px/s);
  assert.match(css, /\.history-filter-trigger\s*\{[^}]*height:\s*40px/s);
  assert.doesNotMatch(css, /history-title-lottery/);
});

test("歷史開獎表格採 17 17 66 比例與 38 56 高度", () => {
  assert.match(css, /\.draw-history-panel\s*\{[^}]*width:\s*366px[^}]*overflow:\s*hidden[^}]*border-radius:\s*14px[^}]*box-shadow:\s*none/s);
  assert.match(css, /\.draw-history-row\s*\{[^}]*min-height:\s*56px[^}]*grid-template-columns:\s*17% 17% 66%/s);
  assert.match(css, /\.draw-history-head\s*\{[^}]*min-height:\s*38px[^}]*height:\s*38px[^}]*font-size:\s*15px[^}]*font-weight:\s*700/s);
  assert.match(css, /\.draw-history-week-list\s*\{[^}]*gap:\s*8px/s);
});

test("歷史開獎期數與日期字級依文件層級", () => {
  assert.match(css, /\.draw-history-row:not\(\.draw-history-head\) \.draw-history-meta:first-child\s*\{[^}]*font-size:\s*14px[^}]*font-weight:\s*700[^}]*letter-spacing:\s*\.25px/s);
  assert.match(css, /\.draw-history-screen \.history-date-stack strong\s*\{[^}]*font-size:\s*13px[^}]*font-weight:\s*700[^}]*line-height:\s*16px/s);
  assert.match(css, /\.draw-history-screen \.history-date-stack small\s*\{[^}]*font-size:\s*12px[^}]*font-weight:\s*500[^}]*line-height:\s*16px/s);
});

test("歷史篩選彈窗尺寸與欄位排列依文件規格", () => {
  assert.match(css, /\.history-filter-sheet\s*\{[^}]*width:\s*366px[^}]*padding:\s*16px[^}]*border-radius:\s*16px/s);
  assert.match(css, /\.history-filter-sheet > header\s*\{[^}]*height:\s*44px/s);
  assert.match(css, /\.history-filter-sheet h2\s*\{[^}]*font-size:\s*22px[^}]*font-weight:\s*700[^}]*line-height:\s*28px/s);
  assert.match(css, /\.history-filter-sheet > header button\s*\{[^}]*width:\s*44px[^}]*height:\s*44px/s);
  assert.match(css, /\.history-filter-icon\s*\{[^}]*width:\s*48px[^}]*height:\s*48px/s);
  assert.match(css, /\.history-filter-fields input\s*\{[^}]*height:\s*44px[^}]*font-size:\s*16px[^}]*font-weight:\s*500[^}]*text-align:\s*left/s);
  assert.match(css, /\.history-date-selects\s*\{[^}]*grid-template-columns:\s*100px minmax\(0, 1fr\) minmax\(0, 1fr\)[^}]*gap:\s*6px/s);
  assert.match(css, /\.history-order-select\s*\{[^}]*height:\s*44px/s);
});

test("歷史篩選範圍與底部操作按鈕依文件尺寸", () => {
  assert.match(css, /\.history-range-options button\s*\{[^}]*height:\s*44px[^}]*padding:\s*4px[^}]*border-radius:\s*9px[^}]*font-size:\s*13px[^}]*font-weight:\s*600/s);
  assert.match(css, /\.history-filter-actions\s*\{[^}]*grid-template-columns:\s*112px minmax\(0, 1fr\)[^}]*gap:\s*8px/s);
  assert.match(css, /\.history-filter-actions button\s*\{[^}]*height:\s*48px[^}]*border-radius:\s*10px[^}]*font-size:\s*17px[^}]*font-weight:\s*700/s);
  assert.match(css, /\.history-filter-actions button:last-child\s*\{[^}]*font-size:\s*18px[^}]*font-weight:\s*700[^}]*box-shadow:\s*none/s);
});

test("歷史彈窗遮罩使用約 71% 黑色且不模糊", () => {
  assert.match(css, /\.filter-sheet-backdrop\s*\{[^}]*background:\s*rgba\(0, 0, 0, \.71\)/s);
  assert.doesNotMatch(css, /\.filter-sheet-backdrop\s*\{[^}]*backdrop-filter:/s);
});

test("歷史頁五球與六加一彩球尺寸及共同基線依文件規格", () => {
  assert.match(ballCss, /\.draw-history-screen \.draw-history-row \.number-ball-component\.history-lottery-ball:is\(\[data-lottery="今彩539"\], \[data-lottery="天天樂"\]\)\s*\{[^}]*--number-ball-size:\s*30px[^}]*--number-font-size:\s*12px/s);
  assert.match(ballCss, /\.draw-history-screen \.draw-history-row \.number-ball-component\.history-lottery-ball:is\(\[data-lottery="六合彩"\], \[data-lottery="大樂透"\]\)\s*\{[^}]*--number-ball-size:\s*28px[^}]*--number-font-size:\s*12px/s);
  assert.match(css, /\.draw-history-screen \.draw-history-row \.history-numbers\[data-has-special="true"\] \.history-main-numbers\s*\{[^}]*gap:\s*2px[^}]*padding-top:\s*10px/s);
  assert.match(css, /\.draw-history-screen \.history-special-ball\s*\{[^}]*height:\s*38px[^}]*grid-template-rows:\s*10px 28px/s);
  assert.match(css, /\.draw-history-screen \.history-special-plus\s*\{[^}]*height:\s*28px[^}]*font-size:\s*14px/s);
  assert.doesNotMatch(css, /draw-history-week-list\[data-lottery="六合彩"\][^\n]*history-special-label[^\n]*translateY/);
});
'''


def sub_once(text, pattern, replacement, label, flags=0):
    updated, count = re.subn(pattern, replacement, text, count=1, flags=flags)
    if count != 1:
        raise RuntimeError(f"{label}: expected 1 replacement, got {count}")
    return updated


def write_tests():
    Path("tests/draw-history-table-layout.test.mjs").write_text(TEST_CONTENT)


def apply_source():
    path = Path("src/FeaturePages.tsx")
    text = path.read_text()
    text = sub_once(text, r'\n  const historyTitleActions = \(\n.*?\n  \);\n\n  return \(', '\n  return (', "remove old title actions", re.S)
    old = '''      className="draw-history-screen"\n      headerAction={historyTitleActions}\n    >\n      <div className="draw-history-week-list"'''
    new = '''      className="draw-history-screen"\n    >\n      <div className="panel history-control-row">\n        <button type="button" className="history-filter-trigger" onClick={() => setFilterOpen(true)}>\n          <svg className="history-filter-trigger-icon" viewBox="0 0 12 12" aria-hidden="true"><path d="M1.5 2h9L7 6v3.2L5 10V6L1.5 2Z" /></svg>\n          篩選條件\n        </button>\n      </div>\n      <div className="draw-history-week-list"'''
    if old not in text:
        raise RuntimeError("history shell anchor not found")
    text = text.replace(old, new, 1)
    old = '''                <div className="history-filter-fields">\n                  <label>'''
    new = '''                <div className="history-filter-fields">\n                  <div className="history-filter-row history-filter-lottery-row">\n                    <span className="history-filter-icon"><img src="/assets/lottery/functions/彩種.png" alt="彩種" /></span>\n                    <div className="select-box native-select history-lottery-select">\n                      <select aria-label="彩種" value={lottery} onChange={(event) => setLottery(event.target.value as LotteryId)}>\n                        {LOTTERIES.map((item) => <option value={item} key={item}>{item}</option>)}\n                      </select>\n                      <ChevronDownIcon />\n                    </div>\n                  </div>\n                  <label>'''
    if old not in text:
        raise RuntimeError("history filter fields anchor not found")
    path.write_text(text.replace(old, new, 1))


def apply_css():
    path = Path("src/feature-pages.css")
    text = path.read_text()
    text = text.replace('.matrix-title-banner-actions .reference-title-actions,\n.matrix-title-banner-actions .history-title-actions { width: 100%; justify-content: flex-end; }', '.matrix-title-banner-actions .reference-title-actions { width: 100%; justify-content: flex-end; }', 1)
    text = text.replace('.matrix-title-banner-actions .reference-title-actions button,\n.matrix-title-banner-actions .history-title-actions button { min-height: 26px; height: 26px; padding-inline: 5px; font-size: 9px; }', '.matrix-title-banner-actions .reference-title-actions button { min-height: 26px; height: 26px; padding-inline: 5px; font-size: 9px; }', 1)
    for pattern, label in [
        (r'\n\.matrix-title-banner-actions \.history-title-lottery \{[^}]*\}\n', 'banner lottery'),
        (r'\.history-title-actions \{[^}]*\}\n', 'title actions'),
        (r'\.history-title-lottery \{[^}]*\}\n', 'title lottery'),
        (r'\.history-title-lottery select \{[^}]*\}\n', 'title lottery select'),
        (r'\.history-title-lottery option \{[^}]*\}\n', 'title lottery option'),
        (r'\.history-title-chevron \{[^}]*\}\n', 'title chevron'),
        (r'\.history-title-chevron svg \{[^}]*\}\n', 'title chevron svg'),
        (r'\.history-title-actions \.history-filter-trigger \{[^}]*\}\n', 'title filter'),
    ]:
        text = sub_once(text, pattern, '', label)
    text = text.replace('.select-box,\n.history-title-lottery {', '.select-box {', 1)
    text = text.replace('.select-box::before,\n.history-title-lottery::before,\n.select-box::after,\n.history-title-lottery::after {', '.select-box::before,\n.select-box::after {', 1)
    text = text.replace('.select-box::before,\n.history-title-lottery::before {', '.select-box::before {', 1)
    text = text.replace('.select-box::after,\n.history-title-lottery::after {', '.select-box::after {', 1)
    text = text.replace('.select-box:focus-within::before,\n.history-title-lottery:focus-within::before {', '.select-box:focus-within::before {', 1)

    draw = r'''.draw-history-screen {
  font-family: -apple-system, BlinkMacSystemFont, "Noto Sans TC", "PingFang TC", "Microsoft JhengHei", sans-serif;
}
.draw-history-screen .matrix-title-banner { margin-bottom: 8px; }
.history-control-row {
  box-sizing: border-box;
  display: flex;
  width: 366px;
  max-width: 100%;
  height: 52px;
  margin: 0 0 12px;
  padding: 6px 8px;
  align-items: center;
  justify-content: flex-end;
  box-shadow: none;
}
.draw-history-week-list { display: grid; width: 366px; max-width: 100%; gap: 8px; }
.draw-history-panel {
  box-sizing: border-box;
  width: 366px;
  max-width: 100%;
  padding: 0;
  overflow: hidden;
  border: 1px solid rgba(195, 145, 54, .58);
  border-radius: 14px;
  box-shadow: none;
}
.draw-history-row {
  display: grid;
  min-height: 56px;
  grid-template-columns: 17% 17% 66%;
  align-items: center;
  border-top: 1px solid rgba(111, 82, 39, .28);
  color: #f3efe8;
  font-size: 12px;
  text-align: center;
}
.draw-history-row:first-child,
.draw-history-head + .draw-history-row { border-top: 0; }
.draw-history-row > span { display: grid; min-width: 0; height: 100%; padding: 0; place-items: center; box-sizing: border-box; }
.draw-history-row > span + span { border-left: 1px solid rgba(126, 91, 39, .28); }
.draw-history-row > .history-numbers { display: flex; }
.draw-history-head {
  min-height: 38px;
  height: 38px;
  border-bottom: 1px solid rgba(195, 145, 54, .68);
  color: #d9ad42;
  font-size: 15px;
  font-weight: 700;
  line-height: 20px;
}
.draw-history-head > span { padding: 0 4px; }
.draw-history-row:not(.draw-history-head) .draw-history-meta:first-child {
  width: 100%;
  padding: 0 4px;
  color: #f5f2ea;
  font-size: 14px;
  font-weight: 700;
  letter-spacing: .25px;
  text-align: center;
  font-variant-numeric: tabular-nums;
}
.draw-history-row:not(.draw-history-head) .draw-history-meta:nth-child(2) { padding: 0 3px; }
.draw-history-screen .history-date-stack { line-height: 1; }
.draw-history-screen .history-date-stack strong { color: #f5f2ea; font-size: 13px; font-weight: 700; line-height: 16px; }
.draw-history-screen .history-date-stack small { margin-top: 0; color: #c7c1b8; font-size: 12px; font-weight: 500; line-height: 16px; }
.draw-history-row .history-numbers { padding: 0 6px; }
.draw-history-screen .draw-history-row .history-numbers,
.draw-history-screen .draw-history-row .history-main-numbers,
.draw-history-screen .draw-history-row .history-special-number { gap: 0; }
.draw-history-screen .draw-history-row .history-main-numbers { gap: 5px; }
.draw-history-screen .draw-history-row .history-numbers:not([data-has-special="true"]) { justify-content: center; }
.draw-history-screen .draw-history-row .history-numbers[data-has-special="true"] { align-items: center; }
.draw-history-screen .draw-history-row .history-numbers[data-has-special="true"] .history-main-numbers { gap: 2px; padding-top: 10px; }
.draw-history-screen .draw-history-row .history-special-number { height: 38px; margin-left: 2px; gap: 2px; align-items: flex-end; }
.draw-history-screen .history-special-ball { height: 38px; grid-template-rows: 10px 28px; }
.draw-history-screen .history-special-label { margin: 0; color: #d4a63b; font-size: 9px; font-weight: 600; line-height: 10px; }
.draw-history-screen .history-special-plus { display: grid; height: 28px; place-items: center; font-size: 14px; font-weight: 900; }
'''
    text = sub_once(text, r'\.draw-history-screen \.draw-history-row \.history-numbers,\n.*?(?=\.history-pagination \{)', draw, "draw history canonical block", re.S)

    trigger = '''.history-filter-trigger {
  display: flex;
  min-width: 68px;
  height: 40px;
  padding: 0 8px;
  align-items: center;
  justify-content: center;
  gap: 5px;
  border: 1px solid #9a6b1e;
  border-radius: 6px;
  background: rgba(5, 12, 17, .9);
  color: #e0ad2c;
  font-size: 12px;
  font-weight: 600;
}'''
    text = sub_once(text, r'\.history-filter-trigger \{.*?\n\}', trigger, "filter trigger", re.S)

    filt = r'''.history-filter-sheet {
  box-sizing: border-box;
  width: 366px;
  max-width: 100%;
  padding: 16px;
  border-radius: 16px;
}
.history-filter-sheet > header { position: relative; height: 44px; justify-content: center; }
.history-filter-sheet > header button { position: absolute; right: -4px; width: 44px; height: 44px; }
.history-filter-sheet > header svg { width: 24px; height: 24px; }
.history-filter-sheet h2 { color: #f1c94f; font-size: 22px; font-weight: 700; line-height: 28px; }
.history-filter-fields { display: grid; margin-top: 12px; gap: 12px; }
.history-filter-fields label,
.history-filter-row { display: grid; min-height: 48px; grid-template-columns: 48px minmax(0, 1fr); align-items: center; gap: 10px; }
.history-filter-fields label > span,
.history-filter-fields legend,
.history-filter-row > span { color: #d9c9a6; font-size: 14px; font-weight: 600; }
.history-filter-icon { display: grid; width: 48px; height: 48px; place-items: center; overflow: hidden; border: 1px solid #74521c; border-radius: 10px; background: #030507; }
.history-filter-icon img { display: block; width: 48px; height: 48px; object-fit: contain; }
.history-filter-fields input { min-width: 0; height: 44px; padding: 0 12px; border: 1px solid #76521d; border-radius: 8px; outline: 0; background: #071018; color: #efe8dc; font-size: 16px; font-weight: 500; text-align: left; }
.history-filter-fields fieldset { min-width: 0; margin: 0; padding: 0; border: 0; }
.history-filter-fields legend { margin-bottom: 8px; }
.history-lottery-select,
.history-order-select { width: 100%; height: 44px; }
.history-lottery-select select { font-size: 16px; font-weight: 500; }
.history-date-selects { display: grid; grid-template-columns: 100px minmax(0, 1fr) minmax(0, 1fr); gap: 6px; }
.history-date-selects .select-box { height: 44px; }
.history-date-selects select { padding: 0 28px 0 8px; font-size: 16px; font-weight: 500; text-align: center; text-align-last: center; }
.history-date-selects option { text-align: center; }
.history-date-selects svg { right: 10px; width: 14px; height: 14px; }
.history-order-select select { padding: 0 32px 0 12px; font-size: 15px; font-weight: 600; text-align: left; text-align-last: left; }
.history-order-select svg,
.history-lottery-select svg { right: 10px; width: 14px; height: 14px; }
.history-filter-sheet .select-box { border: 1px solid #b98723; background: #07131d; }
.history-filter-sheet .select-box::before,
.history-filter-sheet .select-box::after { display: none; }
.history-range-options { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 6px; }
.history-range-options button { height: 44px; padding: 4px; border: 1px solid rgba(185, 135, 35, .46); border-radius: 9px; background: #071018; color: #c8c3ba; font-size: 13px; font-weight: 600; }
.history-range-options button[data-selected="true"] { border-color: #c89622; background: rgba(124, 85, 12, .30); color: #f2cf67; box-shadow: none; }
.history-filter-actions { display: grid; margin-top: 16px; grid-template-columns: 112px minmax(0, 1fr); gap: 8px; }
.history-filter-actions button { height: 48px; border: 1px solid #8f6824; border-radius: 10px; background: #071018; color: #d4b969; font-size: 17px; font-weight: 700; }
.history-filter-actions button:last-child { border-color: #c99a2e; background: linear-gradient(135deg, #efbf4f, #c9800c); color: #17120a; font-size: 18px; font-weight: 700; box-shadow: none; }
'''
    text = sub_once(text, r'\.history-filter-sheet \{.*?(?=\.mini-ball \{)', filt, "history filter canonical block", re.S)
    text = text.replace('background: rgba(0, 0, 0, .64);', 'background: rgba(0, 0, 0, .71);', 1)
    late = '''\n.draw-history-screen .draw-history-head {\n  min-height: 28px;\n  font-size: 13px;\n  font-weight: 700;\n}\n\n.draw-history-screen .draw-history-row .draw-history-meta:first-child {\n  font-size: 10.5px;\n}\n\n.draw-history-screen .draw-history-row .draw-history-meta:nth-child(2) {\n  font-size: 9.5px;\n  white-space: nowrap;\n}\n'''
    if late not in text:
        raise RuntimeError("late duplicate history rules not found")
    text = text.replace(late, '\n', 1)
    if 'history-title-lottery' in text:
        raise RuntimeError("obsolete history-title-lottery CSS remains")
    path.write_text(text)


def apply_balls():
    path = Path("src/number-ball.css")
    text = path.read_text()
    block = r'''.draw-history-screen .draw-history-row .number-ball-component.history-lottery-ball {
  --number-font-size: 12px;
  --number-y: 0px;
  --underline-width: 12px;
  --underline-height: .5px;
  --underline-y: .5px;
}

.draw-history-screen .draw-history-row .number-ball-component.history-lottery-ball .number-ball-value {
  font-family: -apple-system, BlinkMacSystemFont, "Noto Sans TC", "PingFang TC", "Microsoft JhengHei", sans-serif;
}

.draw-history-screen .draw-history-row .number-ball-component.history-lottery-ball:is([data-lottery="今彩539"], [data-lottery="天天樂"]) {
  --number-ball-size: 30px;
  --number-font-size: 12px;
}

.draw-history-screen .draw-history-row .number-ball-component.history-lottery-ball:is([data-lottery="六合彩"], [data-lottery="大樂透"]) {
  --number-ball-size: 28px;
  --number-font-size: 12px;
}

.draw-history-screen .draw-history-row .number-ball-component.history-lottery-ball[data-lottery="六合彩"] {
  --number-ball-asset-scale: 1.62;
}
'''
    path.write_text(sub_once(text, r'\.draw-history-screen \.draw-history-row \.number-ball-component\.history-lottery-ball \{.*\Z', block, "draw history ball rules", re.S))


def apply_all():
    apply_source()
    apply_css()
    apply_balls()


if __name__ == "__main__":
    if sys.argv[1:] == ["--tests"]:
        write_tests()
    elif sys.argv[1:] == ["--apply"]:
        apply_all()
    else:
        raise SystemExit("usage: apply-history-docx-spec.py --tests|--apply")
