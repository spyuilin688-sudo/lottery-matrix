from pathlib import Path
import re


def read(path: str) -> str:
    return Path(path).read_text()


def write(path: str, text: str) -> None:
    Path(path).write_text(text)


def replace_once(path: str, old: str, new: str, expected: int = 1) -> None:
    text = read(path)
    count = text.count(old)
    if count != expected:
        raise SystemExit(f"{path}: expected {expected} occurrence(s), got {count}: {old[:140]!r}")
    write(path, text.replace(old, new, expected))


def sub_once(path: str, pattern: str, replacement: str, flags: int = 0) -> None:
    text = read(path)
    output, count = re.subn(pattern, replacement, text, count=1, flags=flags)
    if count != 1:
        raise SystemExit(f"{path}: regex expected 1 occurrence, got {count}: {pattern[:140]!r}")
    write(path, output)


# 1) Matrix Explore + calculator: shared bottom-nav safe-area clearance and requested margins.
replace_once(
    "src/feature-pages.css",
    ".calculator-screen > .feature-body { box-sizing: border-box; min-width: 0; min-height: 0; flex: 1 1 auto; padding-bottom: 80px; overflow-y: auto; overscroll-behavior-y: contain; }",
    ".calculator-screen > .feature-body { box-sizing: border-box; min-width: 0; min-height: 0; flex: 1 1 auto; padding: 0 20px var(--layout-bottom-nav-clearance); overflow-y: auto; overscroll-behavior-y: contain; }",
)
replace_once(
    "src/matrix-explore-spacing.css",
    "  --layout-bottom-nav-clearance: calc(var(--bottom-navigation-height) + var(--mobile-safe-area-height, 34px));\n",
    "",
)
replace_once("src/matrix-explore-spacing.css", "  padding: 0 16px 1rem;", "  padding: 0 12px var(--layout-bottom-nav-clearance);")
replace_once("src/matrix-explore-spacing.css", "  width: calc(100% - 32px);", "  width: calc(100% - 24px);")
replace_once("src/main.tsx", 'import "./bottom-nav-responsive-clearance.css";\n', "")


# 2) Header actions: 27.4px hit height, rectangular frame, zero text/arrow gap.
replace_once("src/responsive-feature-pages.css", "  height: 44px;\n  min-height: 44px;", "  height: 27.4px;\n  min-height: 27.4px;")
replace_once("src/responsive-feature-pages.css", "  gap: 3px;\n  border: 0;", "  gap: 0;\n  border: 0;")
replace_once("src/responsive-feature-pages.css", "  font-size: 8.1px;", "  font-size: clamp(8px, 2.3vw, 10px);")
replace_once("src/responsive-feature-pages.css", "  height: 23.4px;", "  height: 27.4px;")
replace_once("src/responsive-feature-pages.css", "  height: 21.4px;", "  height: 25.4px;")
clip_path = "  clip-path: polygon(var(--select-tech-cut) 0, calc(100% - var(--select-tech-cut)) 0, 100% var(--select-tech-cut), 100% calc(100% - var(--select-tech-cut)), calc(100% - var(--select-tech-cut)) 100%, var(--select-tech-cut) 100%, 0 calc(100% - var(--select-tech-cut)), 0 var(--select-tech-cut));\n"
replace_once("src/responsive-feature-pages.css", clip_path, "", expected=2)
marker = ".draw-history-screen .history-filter-trigger {\n  min-width: 61.2px;\n}\n"
replace_once(
    "src/responsive-feature-pages.css",
    marker,
    marker
    + "\n.number-reference-screen .matrix-title-banner-actions {\n  width: 40%;\n}\n"
    + "\n.title-card-compact-action .reference-refresh-icon {\n  width: 7px;\n  height: 7px;\n  flex: 0 0 7px;\n}\n",
)

# Remove a conflicting base geometry rule; responsive-feature-pages is the single title-action geometry source.
replace_once(
    "src/feature-pages.css",
    ".number-reference-screen .matrix-title-banner-actions {\n  inset: 0 0 0 50%;\n  display: flex;\n  align-items: center;\n  justify-content: center;\n}\n",
    "",
)


# 3) Content margins. Same-star owns its layout; reference owns its layout; history stays in responsive source.
old_body_group = ".draw-history-screen .feature-body,\n.number-reference-screen .feature-body,\n.tongxing-screen .feature-body,\n.notifications-screen .feature-body,\n.profile-screen .feature-body {\n  box-sizing: border-box;\n  width: 100%;\n  margin-inline: 0;\n  padding-inline: var(--layout-page-inline);\n}\n"
new_body_group = ".draw-history-screen .feature-body {\n  box-sizing: border-box;\n  width: 100%;\n  margin-inline: 0;\n  padding-inline: 20px;\n  gap: 12px;\n}\n\n.profile-screen .feature-body {\n  box-sizing: border-box;\n  width: 100%;\n  margin-inline: 0;\n  padding-inline: var(--layout-page-inline);\n}\n"
replace_once("src/responsive-feature-pages.css", old_body_group, new_body_group)

replace_once(
    "src/feature-pages.css",
    ".number-reference-screen .feature-body {\n  display: flex;\n  width: calc(100% - (var(--layout-page-inline) * 2));\n  margin-inline: var(--layout-page-inline);\n  padding-inline: 0;\n  padding-top: var(--layout-section-gap);\n  flex-direction: column;\n  row-gap: var(--layout-section-gap);\n}\n",
    ".number-reference-screen .feature-body {\n  display: flex;\n  box-sizing: border-box;\n  width: 100%;\n  margin-inline: 0;\n  padding-inline: 20px;\n  padding-top: var(--layout-section-gap);\n  flex-direction: column;\n  row-gap: 12px;\n}\n",
)

replace_once("src/tongxing-compact.css", "  width: calc(100% - (var(--layout-page-inline) * 2));\n  min-width: 0;\n  margin-inline: var(--layout-page-inline);", "  width: calc(100% - 40px);\n  min-width: 0;\n  margin-inline: 20px;")
replace_once("src/tongxing-compact.css", "  width: calc(100% + (var(--layout-page-inline) * 2) - 40px);", "  width: 100%;")


# 4) Floating cards: fixed viewport positioning, 20px sides, same internal geometry.
sub_once("src/feature-pages.css", r'(\.history-filter-panel\[data-floating="true"\]\s*\{\s*)position:\s*absolute;', r"\1position: fixed;")
replace_once(
    "src/feature-pages.css",
    '.reference-query-panel[data-floating="true"] {\n  position: absolute;\n  z-index: 40;\n  left: 50%;\n  box-sizing: border-box;\n  width: calc(100% - (var(--layout-page-inline) * 2));\n  max-height: calc(100dvh - 24px);\n  padding: 8px;\n  overflow-y: auto;\n  border: 1px solid #6c4a20;\n  border-radius: 11px;\n  background: linear-gradient(145deg, rgba(8, 16, 22, .99), rgba(2, 8, 13, .99));\n  box-shadow: 0 12px 34px rgba(0, 0, 0, .72), inset 0 0 18px rgba(150, 102, 34, .04);\n  transform: translateX(-50%);\n}\n',
    '.reference-query-panel[data-floating="true"] {\n  position: fixed;\n  z-index: 40;\n  left: 20px;\n  right: 20px;\n  box-sizing: border-box;\n  width: auto;\n  max-height: calc(100dvh - 24px);\n  padding: 8px;\n  overflow-y: auto;\n  border: 1px solid #6c4a20;\n  border-radius: 11px;\n  background: linear-gradient(145deg, rgba(8, 16, 22, .99), rgba(2, 8, 13, .99));\n  box-shadow: 0 12px 34px rgba(0, 0, 0, .72), inset 0 0 18px rgba(150, 102, 34, .04);\n}\n',
)
sub_once("src/tongxing-compact.css", r'(\.tongxing-query\[data-floating="true"\]\s*\{\s*)position:\s*absolute;', r"\1position: fixed;")


# 5) Straight setting frames and responsive control text.
replace_once("src/feature-pages.css", ".history-filter-panel select { min-width: 0; padding: 0 19px 0 4px; font-size: 10px; font-weight: 600; text-align: center; text-align-last: center; }", ".history-filter-panel select { min-width: 0; padding: 0 19px 0 4px; font-size: clamp(8.5px, 2.6vw, 11px); font-weight: 600; text-align: center; text-align-last: center; }")
replace_once("src/feature-pages.css", ".history-order-select select { font-size: 11px; }", ".history-order-select select { font-size: clamp(8.5px, 2.8vw, 11px); }\n.history-filter-panel .select-box { border: 1px solid #b98723; border-radius: 0; background: #07131d; }\n.history-filter-panel .select-box::before,\n.history-filter-panel .select-box::after { display: none; }")
replace_once("src/feature-pages.css", ".history-filter-start { height: 26px; padding: 0 4px; border: 1px solid #c99a2e; border-radius: 7px; background: linear-gradient(135deg, #efbf4f, #c9800c); color: #17120a; font-size: 11px; font-weight: 700; white-space: nowrap; }", ".history-filter-start { height: 26px; padding: 0 4px; border: 1px solid #c99a2e; border-radius: 7px; background: linear-gradient(135deg, #efbf4f, #c9800c); color: #17120a; font-size: clamp(9px, 2.8vw, 11px); font-weight: 700; white-space: nowrap; }")
replace_once("src/feature-pages.css", ".reference-query-panel .reference-select { height: 26px; }", ".reference-query-panel .reference-select { height: 26px; border: 1px solid #b98723; border-radius: 0; background: #07131d; }\n.reference-query-panel .select-box::before,\n.reference-query-panel .select-box::after { display: none; }")
replace_once("src/feature-pages.css", ".number-reference-screen .reference-select select { padding-left: 7px; padding-right: 25px; font-size: 13px; font-weight: 600; text-align: center; text-align-last: center; }", ".number-reference-screen .reference-select select { padding-left: 7px; padding-right: 25px; font-size: clamp(9px, 3vw, 13px); font-weight: 600; text-align: center; text-align-last: center; }")
replace_once("src/feature-pages.css", ".number-reference-screen .reference-order-select select { padding-left: 5px; padding-right: 22px; font-size: 11.5px; }", ".number-reference-screen .reference-order-select select { padding-left: 5px; padding-right: 22px; font-size: clamp(8.5px, 2.8vw, 11.5px); }")
replace_once("src/feature-pages.css", ".gold-button { height: 42px; padding-inline: 4px; gap: 4px; border: 0; background: linear-gradient(135deg, #f4c95e, #d99513); color: #17120a; font-size: 11px; font-weight: 600; white-space: nowrap; }", ".gold-button { height: 42px; padding-inline: 4px; gap: 4px; border: 0; background: linear-gradient(135deg, #f4c95e, #d99513); color: #17120a; font-size: clamp(9px, 2.8vw, 11px); font-weight: 600; white-space: nowrap; }")

control_marker = ".tongxing-panel-scope .query-selects .select-box,\n.tongxing-panel-scope .same-star-fields input,\n.tongxing-panel-scope .same-star-period-select {\n  height: var(--control-height);\n}\n"
replace_once(
    "src/tongxing-compact.css",
    control_marker,
    control_marker + "\n.tongxing-panel-scope .query-selects .select-box,\n.tongxing-panel-scope .same-star-period-select {\n  border: 1px solid #b98723;\n  border-radius: 0;\n  background: #07131d;\n}\n\n.tongxing-panel-scope .select-box::before,\n.tongxing-panel-scope .select-box::after { display: none; }\n",
)
replace_once("src/tongxing-compact.css", "font-size: .75rem;", "font-size: clamp(9px, 3vw, 12px);", expected=3)
replace_once("src/tongxing-compact.css", "  font-size: 18px;\n  font-weight: 600;\n}", "  font-size: clamp(14px, 4.6vw, 18px);\n  font-weight: 600;\n}", expected=2)


# 6) Same-star result distinction.
replace_once("src/tongxing-compact.css", "  --group-divider-width: 2px;", "  --group-divider-width: 3px;")
replace_once("src/tongxing-compact.css", "border-top: var(--group-divider-width) solid rgba(168, 119, 47, .7);", "border-top: var(--group-divider-width) solid rgba(168, 119, 47, .9);")
replace_once("src/tongxing-compact.css", "background: rgba(126, 83, 15, .12);", "background: rgba(126, 83, 15, .24);")
replace_once("src/tongxing-compact.css", "background: rgba(10, 61, 88, .13);", "background: rgba(10, 61, 88, .25);")
replace_once("src/tongxing-compact.css", "rgba(105, 129, 140, .31)", "rgba(105, 129, 140, .55)")


# 7) History 539 underline: prevent Matrix Explore selector leakage and keep true .2px history spacing.
ball_text = read("src/number-ball.css")
selector_count = ball_text.count(".matrix-explore-main-screen .history-panel")
if selector_count != 4:
    raise SystemExit(f"src/number-ball.css: expected 4 leaking Matrix Explore selectors, got {selector_count}")
ball_text = ball_text.replace(".matrix-explore-main-screen .history-panel", ".matrix-explore-main-screen .matrix-explore-history-panel")
ball_anchor = '.history-panel .number-ball-component.history-lottery-ball {\n  --number-ball-size: 28px;\n  --number-font-size: 12px;\n  --number-y: 0px;\n  --underline-width: 11px;\n  --underline-height: .5px;\n  --underline-y: .25px;\n}\n'
if ball_text.count(ball_anchor) != 1:
    raise SystemExit("src/number-ball.css: history ball anchor mismatch")
ball_text = ball_text.replace(ball_anchor, ball_anchor + '\n.draw-history-screen .draw-history-panel[data-lottery="今彩539"] .number-ball-component.history-lottery-ball {\n  --underline-y: .2px;\n}\n', 1)
write("src/number-ball.css", ball_text)


# 8) History filter date is opt-in; fixed cards use viewport coordinates; refresh icon gets 7px hook.
replace_once("src/FeaturePages.tsx", '  const [day, setDay] = useTimedState("history-day", "31日");', '  const [day, setDay] = useTimedState("history-day", "31日");\n  const [dateFilterTouched, setDateFilterTouched] = useState(false);')
replace_once("src/FeaturePages.tsx", '      date: `${year}/${month.replace("月", "")}/${day.replace("日", "")}`,', '      date: dateFilterTouched ? `${year}/${month.replace("月", "")}/${day.replace("日", "")}` : "",')
replace_once("src/FeaturePages.tsx", 'value={year} onChange={(event) => setYear(event.target.value)}', 'value={year} onChange={(event) => { setYear(event.target.value); setDateFilterTouched(true); }}')
replace_once("src/FeaturePages.tsx", 'value={month} onChange={(event) => setMonth(event.target.value)}', 'value={month} onChange={(event) => { setMonth(event.target.value); setDateFilterTouched(true); }}')
replace_once("src/FeaturePages.tsx", 'value={day} onChange={(event) => setDay(event.target.value)}', 'value={day} onChange={(event) => { setDay(event.target.value); setDateFilterTouched(true); }}')
for setter, screen in [
    ("setFilterPanelTop", ".draw-history-screen > .feature-brand-header"),
    ("setSettingsPanelTop", ".tongxing-screen > .feature-brand-header"),
    ("setQueryPanelTop", ".number-reference-screen > .feature-brand-header"),
]:
    pattern = rf'''    const header = document\.querySelector<HTMLElement>\("{re.escape(screen)}"\);\n    const mobilePage = document\.querySelector<HTMLElement>\("\.mobile-page"\);\n    const pageRect = mobilePage\?\.getBoundingClientRect\(\);\n    const pageTop = pageRect\?\.top \?\? 0;\n    const pageScale = pageRect && mobilePage\?\.offsetWidth \? pageRect\.width / mobilePage\.offsetWidth : 1;\n    {setter}\(\(\(header\?\.getBoundingClientRect\(\)\.bottom \?\? pageTop\) - pageTop\) / pageScale \+ 8\);'''
    replacement = f'''    const header = document.querySelector<HTMLElement>("{screen}");\n    {setter}((header?.getBoundingClientRect().bottom ?? 0) + 8);'''
    sub_once("src/FeaturePages.tsx", pattern, replacement)
replace_once("src/FeaturePages.tsx", "<ReloadIcon />刷新", '<ReloadIcon className="reference-refresh-icon" />刷新')


# 9) Shortcut / Notifications / Profile logo: inherit the shared homepage brand geometry and normal 8px section gap.
sub_once(
    "src/responsive-feature-pages.css",
    r'\n\.bottom-nav-brand-screen > \.feature-brand-header \{.*?\}\n\n\.bottom-nav-brand-screen \.shared-brand-logo \{.*?\}\n\n\.bottom-nav-brand-screen > \.feature-brand-header\[data-compact="true"\] > \.shared-brand-logo > img \{.*?\}\n',
    "\n",
    re.S,
)
sub_once(
    "src/responsive-feature-pages.css",
    r'\n\.bottom-nav-brand-screen\.notifications-screen > \.feature-brand-header:not\(\.integrated-title-header\) \{.*?\}\n',
    "\n",
    re.S,
)


# 10) Notifications: remove duplicate fixed values and 360px compensation, retain one clamp-based responsive source.
replace_once("src/responsive-feature-pages.css", "  grid-template-columns: 48px minmax(0, 1fr) 76px 42px;\n  column-gap: 6px;", "  grid-template-columns: clamp(40px, 12.3vw, 48px) minmax(0, 1fr) clamp(64px, 19.5vw, 76px) 42px;\n  column-gap: clamp(4px, 1.5vw, 6px);")
replace_once("src/responsive-feature-pages.css", "  width: 44px;\n  height: 44px;", "  width: clamp(40px, 11.3vw, 44px);\n  height: clamp(40px, 11.3vw, 44px);", expected=2)
replace_once("src/responsive-feature-pages.css", "  width: 72px;\n  height: 32px;\n  padding-inline: 8px;\n  font-size: 11px;", "  width: clamp(64px, 18.5vw, 72px);\n  height: 32px;\n  padding-inline: clamp(5px, 2vw, 8px);\n  font-size: clamp(10px, 2.8vw, 11px);")
sub_once("src/responsive-feature-pages.css", r'\n@media \(max-width: 360px\) \{.*?\n\}\s*$', "\n", re.S)
replace_once("src/feature-pages.css", ".notification-row { display: grid; width: 100%; height: 80px; min-height: 0; padding: 8px; }", ".notification-row { display: grid; width: 100%; min-height: 0; }")
replace_once("src/feature-pages.css", ".notification-heading { display: grid; grid-template-columns: 58px minmax(0, 1fr) 88px 46px; align-items: center; column-gap: 8px; }", ".notification-heading { display: grid; align-items: center; }")
replace_once("src/feature-pages.css", ".notification-icon { display: grid; width: 58px; height: 58px; place-items: center; justify-self: start; }", ".notification-icon { display: grid; place-items: center; justify-self: start; }")
replace_once("src/feature-pages.css", ".notification-icon img { display: block; width: 58px; height: 58px; object-fit: contain; }", ".notification-icon img { display: block; object-fit: contain; }")
replace_once("src/feature-pages.css", ".notification-actions > button:first-child { width: 88px; height: 38px; padding: 0 12px; justify-self: end; border: 1px solid rgba(211, 166, 66, .62); border-radius: 19px; background: transparent; box-shadow: none; color: rgba(211, 166, 66, .88); font-size: 14px; font-weight: 600; line-height: 18px; white-space: nowrap; }", ".notification-actions > button:first-child { justify-self: end; border: 1px solid rgba(211, 166, 66, .62); border-radius: 19px; background: transparent; box-shadow: none; color: rgba(211, 166, 66, .88); font-weight: 600; line-height: 18px; white-space: nowrap; }")
replace_once("src/feature-pages.css", ".notifications-screen .feature-body { padding: 0 20px calc(var(--bottom-navigation-height) + var(--mobile-safe-area-height, 34px) + 12px); }", ".notifications-screen .feature-body { padding: 0 20px calc(var(--layout-bottom-nav-clearance) + 12px); }")


# 11) Update remaining stale regression expectations that are part of this source cleanup.
option_test = read("tests/matrix-explore-option-layout.test.mjs")
option_test = option_test.replace(r"padding:\s*0 16px 1rem;", r"padding:\s*0 12px var\(--layout-bottom-nav-clearance\);")
option_test = option_test.replace(r"width:\s*calc\(100% - 32px\);", r"width:\s*calc\(100% - 24px\);")
write("tests/matrix-explore-option-layout.test.mjs", option_test)

Path("tests/bottom-navigation-height.test.mjs").write_text('''import assert from "node:assert/strict";\nimport fs from "node:fs";\nimport test from "node:test";\n\ntest("底部導覽使用 82px 正式高度與瀏覽器 safe area 響應式避讓", () => {\n  const tokens = fs.readFileSync(new URL("../src/design-tokens.css", import.meta.url), "utf8");\n  const prototype = fs.readFileSync(new URL("../src/prototype.css", import.meta.url), "utf8");\n  assert.match(tokens, /--bottom-navigation-height:\\s*82px;/);\n  assert.match(tokens, /--layout-bottom-nav-clearance:\\s*calc\\(var\\(--bottom-navigation-height\\) \\+ env\\(safe-area-inset-bottom,\\s*0px\\)\\);/);\n  assert.doesNotMatch(tokens, /--layout-bottom-nav-clearance:[^;]*--mobile-safe-area-height/);\n  assert.match(prototype, /\\.bottom-nav-brand-screen:not\\(\\.notifications-screen\\) > \\.feature-body\\s*\\{[^}]*padding-bottom:\\s*var\\(--layout-bottom-nav-clearance\\);/s);\n});\n''')

# Permanent contract for this requested batch.
Path("tests/ui-responsive-cleanup-contract.test.mjs").write_text(r'''import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const feature = fs.readFileSync('src/feature-pages.css', 'utf8');
const responsive = fs.readFileSync('src/responsive-feature-pages.css', 'utf8');
const tongxing = fs.readFileSync('src/tongxing-compact.css', 'utf8');
const explore = fs.readFileSync('src/matrix-explore-spacing.css', 'utf8');
const balls = fs.readFileSync('src/number-ball.css', 'utf8');
const source = fs.readFileSync('src/FeaturePages.tsx', 'utf8');
const main = fs.readFileSync('src/main.tsx', 'utf8');

test('三頁標題操作按鈕為 27.4px 直角外框、零文字箭頭間距，對照單刷新 7px', () => {
  assert.match(responsive, /\.title-card-compact-action\s*\{[^}]*height:\s*27\.4px;[^}]*min-height:\s*27\.4px;[^}]*gap:\s*0;/s);
  assert.doesNotMatch(responsive.match(/\.title-card-compact-action::before\s*\{[^}]*\}/s)?.[0] ?? '', /clip-path/);
  assert.doesNotMatch(responsive.match(/\.title-card-compact-action::after\s*\{[^}]*\}/s)?.[0] ?? '', /clip-path/);
  assert.match(responsive, /\.number-reference-screen \.matrix-title-banner-actions\s*\{[^}]*width:\s*40%;/s);
  assert.match(responsive, /\.title-card-compact-action \.reference-refresh-icon\s*\{[^}]*width:\s*7px;[^}]*height:\s*7px;/s);
});

test('同星、對照單、歷史、計算機與 Matrix Explore 使用指定外距', () => {
  assert.match(tongxing, /\.tongxing-screen \.feature-body\s*\{[^}]*width:\s*calc\(100% - 40px\);[^}]*margin-inline:\s*20px;/s);
  assert.match(feature, /\.number-reference-screen \.feature-body\s*\{[^}]*width:\s*100%;[^}]*padding-inline:\s*20px;[^}]*row-gap:\s*12px;/s);
  assert.match(responsive, /\.draw-history-screen \.feature-body\s*\{[^}]*padding-inline:\s*20px;[^}]*gap:\s*12px;/s);
  assert.match(feature, /\.calculator-screen > \.feature-body\s*\{[^}]*padding:\s*0 20px var\(--layout-bottom-nav-clearance\);/s);
  assert.match(explore, /\.matrix-explore-main-screen \.feature-body\s*\{[^}]*padding:\s*0 12px var\(--layout-bottom-nav-clearance\);/s);
  assert.match(explore, /\.matrix-explore-main-screen \.matrix-title-banner\s*\{[^}]*width:\s*calc\(100% - 24px\);/s);
  assert.doesNotMatch(responsive, /\.number-reference-screen \.feature-body\s*\{/);
});

test('三個浮動設定卡固定於 viewport、左右 20px 且 top 使用 viewport 座標', () => {
  assert.match(tongxing, /\.tongxing-query\[data-floating="true"\]\s*\{[^}]*position:\s*fixed;[^}]*left:\s*20px;[^}]*right:\s*20px;/s);
  assert.match(feature, /\.history-filter-panel\[data-floating="true"\]\s*\{[^}]*position:\s*fixed;[^}]*left:\s*20px;[^}]*right:\s*20px;/s);
  assert.match(feature, /\.reference-query-panel\[data-floating="true"\]\s*\{[^}]*position:\s*fixed;[^}]*left:\s*20px;[^}]*right:\s*20px;/s);
  assert.match(source, /setFilterPanelTop\(\(header\?\.getBoundingClientRect\(\)\.bottom \?\? 0\) \+ 8\)/);
  assert.match(source, /setSettingsPanelTop\(\(header\?\.getBoundingClientRect\(\)\.bottom \?\? 0\) \+ 8\)/);
  assert.match(source, /setQueryPanelTop\(\(header\?\.getBoundingClientRect\(\)\.bottom \?\? 0\) \+ 8\)/);
});

test('設定區直角選項與文字響應式適配', () => {
  assert.match(feature, /\.history-filter-panel \.select-box::before,[\s\S]*?\.history-filter-panel \.select-box::after\s*\{\s*display:\s*none;/s);
  assert.match(feature, /\.reference-query-panel \.select-box::before,[\s\S]*?\.reference-query-panel \.select-box::after\s*\{\s*display:\s*none;/s);
  assert.match(tongxing, /\.tongxing-panel-scope \.select-box::before,[\s\S]*?\.tongxing-panel-scope \.select-box::after\s*\{\s*display:\s*none;/s);
  assert.match(feature, /\.history-filter-panel select\s*\{[^}]*font-size:\s*clamp\(/s);
  assert.match(feature, /\.number-reference-screen \.reference-select select\s*\{[^}]*font-size:\s*clamp\(/s);
  assert.equal((tongxing.match(/font-size:\s*clamp\(9px, 3vw, 12px\);/g) ?? []).length, 3);
});

test('歷史日期未修改時不自動套用預設日期', () => {
  assert.match(source, /const \[dateFilterTouched, setDateFilterTouched\] = useState\(false\);/);
  assert.match(source, /date:\s*dateFilterTouched\s*\?/);
  assert.match(source, /setDateFilterTouched\(true\)/);
});

test('歷史今彩539真實使用 .2px 底線且 Matrix Explore 不洩漏', () => {
  assert.doesNotMatch(balls, /\.matrix-explore-main-screen \.history-panel/);
  assert.match(balls, /\.matrix-explore-main-screen \.matrix-explore-history-panel/);
  assert.match(balls, /\.draw-history-screen \.draw-history-panel\[data-lottery="今彩539"\][^}]*--underline-y:\s*\.2px;/s);
});

test('通知與底部品牌頁移除固定 Logo 特例和小螢幕強拉', () => {
  assert.match(feature, /\.notifications-screen \.feature-body\s*\{[^}]*var\(--layout-bottom-nav-clearance\)/s);
  assert.doesNotMatch(feature, /\.notifications-screen \.feature-body\s*\{[^}]*--mobile-safe-area-height/s);
  assert.doesNotMatch(responsive, /\.bottom-nav-brand-screen \.shared-brand-logo\s*\{[^}]*width:\s*75%/s);
  assert.doesNotMatch(responsive, /bottom-nav-brand-screen\.notifications-screen[^}]*margin-bottom:\s*4px/s);
  assert.doesNotMatch(responsive, /@media \(max-width:\s*360px\)[\s\S]*?notification-heading/);
  assert.match(responsive, /\.notification-heading\s*\{[^}]*grid-template-columns:\s*clamp\(/s);
});

test('同星結果列增加背景與群組分隔辨識', () => {
  assert.match(tongxing, /--group-divider-width:\s*3px;/);
  assert.match(tongxing, /data-row-type="locked"[^}]*rgba\(126, 83, 15, \.24\)/s);
  assert.match(tongxing, /data-row-type="predicted"[^}]*rgba\(10, 61, 88, \.25\)/s);
});

test('臨時底部安全區 override 已移除', () => {
  assert.doesNotMatch(explore, /--layout-bottom-nav-clearance:[^;]*--mobile-safe-area-height/);
  assert.doesNotMatch(feature, /\.calculator-screen > \.feature-body\s*\{[^}]*80px/s);
  assert.doesNotMatch(main, /bottom-nav-responsive-clearance\.css/);
  assert.equal(fs.existsSync('src/bottom-nav-responsive-clearance.css'), false);
});
''')

# Remove temporary source override files from the earlier incomplete bottom-nav fix.
for temporary in ["src/bottom-nav-responsive-clearance.css", "tests/bottom-navigation-responsive-clearance.test.mjs"]:
    p = Path(temporary)
    if p.exists():
        p.unlink()
