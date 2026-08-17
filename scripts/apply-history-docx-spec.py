from pathlib import Path
import re
import sys


def sub_once(text: str, pattern: str, replacement: str, label: str, flags: int = 0) -> str:
    regex = re.compile(pattern, flags)
    matches = list(regex.finditer(text))
    if len(matches) != 1:
        raise RuntimeError(f"{label}: expected 1 replacement, got {len(matches)}")
    match = matches[0]
    return text[:match.start()] + replacement + text[match.end():]


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected 1 replacement, got {count}")
    return text.replace(old, new, 1)


def write_tests() -> None:
    path = Path("tests/draw-history-table-layout.test.mjs")
    text = path.read_text()
    replacement = r'''test("彩種下拉移入篩選條件第一項並保留標題列篩選按鈕", () => {
  const source = readFileSync(new URL("../src/FeaturePages.tsx", import.meta.url), "utf8");
  const fieldsStart = source.indexOf('<div className="history-filter-fields">');
  const lotteryIcon = source.indexOf('/assets/lottery/functions/彩種.png', fieldsStart);
  const lotterySelect = source.indexOf('aria-label="彩種"', fieldsStart);
  const issueIcon = source.indexOf('/assets/history-filter/issue.png', fieldsStart);
  const titleActions = source.indexOf('const historyTitleActions');
  const filterTrigger = source.indexOf('className="history-filter-trigger"', titleActions);
  const shellAction = source.indexOf('headerAction={historyTitleActions}', titleActions);

  assert.ok(fieldsStart >= 0);
  assert.ok(lotteryIcon > fieldsStart && lotteryIcon < issueIcon);
  assert.ok(lotterySelect > fieldsStart && lotterySelect < issueIcon);
  assert.ok(titleActions >= 0 && filterTrigger > titleActions && shellAction > filterTrigger);
  assert.doesNotMatch(source, /history-title-lottery|history-title-chevron/);
  assert.doesNotMatch(css, /history-title-lottery|history-title-chevron/);
  assert.match(css, /\.draw-history-screen \.history-title-actions \.history-filter-trigger\s*\{[^}]*min-width:\s*68px[^}]*height:\s*26px[^}]*flex:\s*0 0 68px[^}]*font-size:\s*9px/s);
});'''
    text = sub_once(
        text,
        r'test\("標題卡控制項固定在右側並保留完整彩種文字寬度", \(\) => \{.*?\n\}\);',
        replacement,
        "replace obsolete title-lottery test",
        re.S,
    )
    text = replace_once(
        text,
        r'--underline-y:\s*-1\.2px',
        r'--underline-y:\s*-1\.5px',
        "align stale lottery underline test with current canonical rule",
    )
    path.write_text(text)


def apply_source() -> None:
    path = Path("src/FeaturePages.tsx")
    text = path.read_text()

    text = sub_once(
        text,
        r'\n      <div className="history-title-lottery native-select">\n        <select\n          aria-label="彩種".*?\n        <span className="history-title-chevron" aria-hidden="true"><ChevronDownIcon /></span>\n      </div>',
        "",
        "remove header lottery selector",
        re.S,
    )

    anchor = '''                <div className="history-filter-fields">\n                  <label>'''
    replacement = '''                <div className="history-filter-fields">\n                  <div className="history-filter-row">\n                    <span className="history-filter-icon"><img src="/assets/lottery/functions/彩種.png" alt="彩種" /></span>\n                    <div className="select-box native-select">\n                      <select aria-label="彩種" value={lottery} onChange={(event) => setLottery(event.target.value as LotteryId)}>\n                        {LOTTERIES.map((item) => <option value={item} key={item}>{item}</option>)}\n                      </select>\n                      <ChevronDownIcon />\n                    </div>\n                  </div>\n                  <label>'''
    text = replace_once(text, anchor, replacement, "history filter first-row insertion")

    if "history-title-lottery" in text or "history-title-chevron" in text:
        raise RuntimeError("obsolete title lottery markup remains")
    path.write_text(text)


def apply_css() -> None:
    path = Path("src/feature-pages.css")
    text = path.read_text()

    grouped_replacements = [
        ('.select-box,\n.history-title-lottery {', '.select-box {'),
        ('.select-box::before,\n.history-title-lottery::before,\n.select-box::after,\n.history-title-lottery::after {', '.select-box::before,\n.select-box::after {'),
        ('.select-box::before,\n.history-title-lottery::before {', '.select-box::before {'),
        ('.select-box::after,\n.history-title-lottery::after {', '.select-box::after {'),
        ('.select-box:focus-within::before,\n.history-title-lottery:focus-within::before {', '.select-box:focus-within::before {'),
    ]
    for old, new in grouped_replacements:
        text = replace_once(text, old, new, "remove obsolete title selector from shared select rule")

    obsolete_rules = [
        '.matrix-title-banner-actions .history-title-lottery { width: 84px; height: 26px; flex-basis: 84px; }\n',
        '.history-title-lottery { display: grid; width: 92px; height: 26px; flex: 0 0 92px; grid-template-columns: minmax(0, 1fr) 18px; }\n',
        '.history-title-lottery select { position: relative; z-index: 1; width: 100%; height: 100%; padding: 0 20px 0 5px; grid-row: 1; grid-column: 1 / -1; appearance: none; border: 0; outline: 0; background: transparent; color: var(--select-tech-text); font-size: 8px; }\n',
        '.history-title-lottery option { font-size: 8px; }\n',
        '.history-title-chevron { position: relative; z-index: 2; display: grid; grid-row: 1; grid-column: 2; place-items: center; color: var(--select-tech-accent); pointer-events: none; }\n',
        '.history-title-chevron svg { display: block; width: 12px; height: 12px; stroke-width: 2.5; }\n',
    ]
    for rule in obsolete_rules:
        text = replace_once(text, rule, "", "remove obsolete title lottery CSS rule")

    text = sub_once(
        text,
        r'\n\.draw-history-screen \.history-title-lottery\.native-select select \{[^}]*\}',
        "",
        "remove history-screen title lottery rule",
        re.S,
    )

    if "history-title-lottery" in text or "history-title-chevron" in text:
        raise RuntimeError("obsolete title lottery CSS remains")
    path.write_text(text)


def apply_all() -> None:
    apply_source()
    apply_css()


if __name__ == "__main__":
    if sys.argv[1:] == ["--tests"]:
        write_tests()
    elif sys.argv[1:] == ["--apply"]:
        apply_all()
    else:
        raise SystemExit("usage: apply-history-docx-spec.py --tests|--apply")
