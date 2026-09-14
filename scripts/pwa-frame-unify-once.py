from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def write(path: str, text: str) -> None:
    (ROOT / path).write_text(text, encoding="utf-8")


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one match, found {count}")
    return text.replace(old, new, 1)


def regex_once(text: str, pattern: str, replacement: str, label: str) -> str:
    updated, count = re.subn(pattern, replacement, text, count=1, flags=re.S)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one regex match, found {count}")
    return updated


# Matrix Explore: remove the near-10-draw section from the production render path.
path = "src/features/MatrixExplorePage.tsx"
text = read(path)
text = replace_once(text, ", LotteryTabs, HistoryList } from \"./shared\";", ", LotteryTabs } from \"./shared\";", "remove HistoryList import")
text = regex_once(text, r"\n\s*const \[historyExpanded, setHistoryExpanded\] = useState\(true\);", "", "remove historyExpanded state")
text = replace_once(text, "    setHistoryExpanded(true);\n", "", "remove lottery history reset")
text = replace_once(text, "  setHistoryExpanded(false);\n", "", "remove explore history collapse")
text = regex_once(
    text,
    r"\n\s*\{isExplore \? \(\s*<HistoryList\b.*?onExpandedChange=\{setHistoryExpanded\}\s*/>\s*\) : null\}\s*",
    "\n",
    "remove Explore HistoryList render",
)
write(path, text)

# Canonical lottery tab system: preserve framed tabs generally, restore the approved underline mode only on Explore and Matrix Card.
path = "src/feature-pages.css"
text = read(path)
old_tabs = """.lottery-tabs { display: grid; height: 36px; margin: 0 0 var(--lottery-tabs-bottom-gap, 8px); grid-template-columns: repeat(4, minmax(0, 1fr)); }
.lottery-tabs button { display: grid; min-width: 0; padding: 0; place-items: center; border: 1px solid var(--pwa-frame-tertiary); background: var(--pwa-control-surface); color: var(--lottery-text-secondary); font-size: 14px; border-radius: var(--pwa-frame-radius); }
.lottery-tabs button > span { display: inline-block; padding-bottom: 4px;  line-height: 1.3; white-space: nowrap; }
.lottery-tabs button[data-selected=\"true\"] { color: var(--pwa-frame-secondary); background: var(--pwa-control-selected); border-color: var(--pwa-frame-secondary); }
"""
new_tabs = """.lottery-tabs {
  --lottery-tab-border-width: 1px;
  --lottery-tab-border-color: var(--pwa-frame-tertiary);
  --lottery-tab-background: var(--pwa-control-surface);
  --lottery-tab-selected-border-color: var(--pwa-frame-secondary);
  --lottery-tab-selected-background: var(--pwa-control-selected);
  --lottery-tab-selected-underline: transparent;
  display: grid;
  height: 36px;
  margin: 0 0 var(--lottery-tabs-bottom-gap, 8px);
  grid-template-columns: repeat(4, minmax(0, 1fr));
}
.matrix-explore-screen:not(.matrix-tianheng-screen):not(.matrix-tianyan-screen) .lottery-tabs,
.matrix-card-body .lottery-tabs {
  --lottery-tab-border-width: 0px;
  --lottery-tab-border-color: transparent;
  --lottery-tab-background: transparent;
  --lottery-tab-selected-border-color: transparent;
  --lottery-tab-selected-background: transparent;
  --lottery-tab-selected-underline: var(--pwa-frame-secondary);
}
.lottery-tabs button {
  display: grid;
  min-width: 0;
  padding: 0;
  place-items: center;
  border: var(--lottery-tab-border-width) solid var(--lottery-tab-border-color);
  border-radius: var(--pwa-frame-radius);
  background: var(--lottery-tab-background);
  color: var(--lottery-text-secondary);
  font-size: 14px;
}
.lottery-tabs button > span {
  display: inline-block;
  padding-bottom: 4px;
  border-bottom: 2px solid transparent;
  line-height: 1.3;
  white-space: nowrap;
}
.lottery-tabs button[data-selected=\"true\"] {
  border-color: var(--lottery-tab-selected-border-color);
  background: var(--lottery-tab-selected-background);
  color: var(--pwa-frame-secondary);
}
.lottery-tabs button[data-selected=\"true\"] > span { border-bottom-color: var(--lottery-tab-selected-underline); }
"""
text = replace_once(text, old_tabs, new_tabs, "refactor canonical lottery tabs")
text = replace_once(text, "border-right-color: rgba(167, 117, 32, .54);", "border-right-color: var(--pwa-frame-divider);", "quiet reference special divider")
write(path, text)

# Explore/Tianheng/Tianyan/Tiangong advanced-setting divider must match the standard outer frame.
path = "src/matrix-explore-spacing.css"
text = read(path)
text = regex_once(
    text,
    r"(\.matrix-explore-main-screen \.advanced-row \{.*?border-top:\s*1px solid )var\(--pwa-frame-divider\)(;.*?\})",
    r"\1var(--pwa-frame-secondary)\2",
    "advanced-row divider",
)
text = regex_once(
    text,
    r"(\.matrix-tiangong-screen \.tiangong-general-settings \.tiangong-advanced-divider \{.*?border-bottom:\s*1px solid )var\(--pwa-frame-divider\)(;.*?\})",
    r"\1var(--pwa-frame-secondary)\2",
    "Tiangong advanced divider",
)
write(path, text)

# Expanded validation separators above road summary / below road result use the same standard frame color.
path = "src/explore-result-preview.css"
text = read(path)
text = regex_once(
    text,
    r"(\.explore-validation-card \{.*?border-top-color:\s*)var\(--pwa-frame-divider\)(;.*?border-bottom-color:\s*)var\(--pwa-frame-divider\)(;.*?\})",
    r"\1var(--pwa-frame-secondary)\2var(--pwa-frame-secondary)\3",
    "validation summary/result separators",
)
write(path, text)

# Homepage selected lottery: one step brighter border, still no glow.
path = "src/homepage/lottery-switcher.css"
text = read(path)
text = replace_once(
    text,
    "border-color: color-mix(in srgb, var(--home-frame-gold) 45%, transparent);",
    "border-color: color-mix(in srgb, var(--home-frame-bright) 55%, transparent);",
    "homepage selected lottery border",
)
write(path, text)

# About Matrix: remove only the first heading's trailing punctuation.
path = "src/features/MemberPages.tsx"
text = read(path)
text = replace_once(text, "<p className=\"about-welcome\">歡迎使用 樂彩 Matrix。</p>", "<p className=\"about-welcome\">歡迎使用 樂彩 Matrix</p>", "About Matrix heading punctuation")
write(path, text)

# Keep the visual contract aligned with the two intentionally restored underline-mode pages.
path = "tests/pwa-frame-system.spec.ts"
text = read(path)
old_controls = """    const controls = page.locator('.segmented button, .segmented-static, .hit-options button, .native-select, .lottery-tabs button, .matrix-card-order button');
    for (const control of await controls.all()) {
      if (!(await control.isVisible())) continue;
      await expect(control).toHaveCSS('border-top-width', '1px');
      const selected = await control.evaluate(element => element.getAttribute('data-selected') === 'true' || element.classList.contains('is-selected'));
      await expect(control).toHaveCSS('border-top-color', selected ? colors.secondary : colors.tertiary);
      await expect(control).toHaveCSS('box-shadow', 'none');
    }
"""
new_controls = """    const controls = page.locator('.segmented button, .segmented-static, .hit-options button, .native-select, .matrix-card-order button');
    for (const control of await controls.all()) {
      if (!(await control.isVisible())) continue;
      await expect(control).toHaveCSS('border-top-width', '1px');
      const selected = await control.evaluate(element => element.getAttribute('data-selected') === 'true' || element.classList.contains('is-selected'));
      await expect(control).toHaveCSS('border-top-color', selected ? colors.secondary : colors.tertiary);
      await expect(control).toHaveCSS('box-shadow', 'none');
    }
    const underlineLotteryTabs = screen === 'explore' || screen === 'matrix-card';
    for (const tab of await page.locator('.lottery-tabs button').all()) {
      if (!(await tab.isVisible())) continue;
      await expect(tab).toHaveCSS('border-top-width', underlineLotteryTabs ? '0px' : '1px');
      const selected = await tab.getAttribute('data-selected') === 'true';
      if (underlineLotteryTabs) {
        await expect(tab.locator('span')).toHaveCSS('border-bottom-color', selected ? colors.secondary : 'rgba(0, 0, 0, 0)');
      } else {
        await expect(tab).toHaveCSS('border-top-color', selected ? colors.secondary : colors.tertiary);
      }
      await expect(tab).toHaveCSS('box-shadow', 'none');
    }
"""
text = replace_once(text, old_controls, new_controls, "update lottery-tab visual contract")
write(path, text)

# Add focused static regression checks to the existing frame-system test owner.
path = "tests/pwa-frame-system.test.mjs"
text = read(path)
marker = "test('requested PWA frame refinements remain canonical and scoped', () => {"
if marker in text:
    raise SystemExit("focused regression test already exists")
text += """

test('requested PWA frame refinements remain canonical and scoped', () => {
  const explore = read('src/features/MatrixExplorePage.tsx');
  const spacing = read('src/matrix-explore-spacing.css');
  const validation = read('src/explore-result-preview.css');
  const homeSwitcher = read('src/homepage/lottery-switcher.css');
  const memberPages = read('src/features/MemberPages.tsx');

  assert.doesNotMatch(explore, /HistoryList/);
  assert.doesNotMatch(explore, /historyExpanded/);
  assert.match(css, /\.matrix-explore-screen:not\(\.matrix-tianheng-screen\):not\(\.matrix-tianyan-screen\) \.lottery-tabs,\s*\.matrix-card-body \.lottery-tabs/);
  assert.match(css, /--lottery-tab-selected-underline:\s*var\(--pwa-frame-secondary\)/);
  assert.match(spacing, /\.matrix-explore-main-screen \.advanced-row \{[\s\S]*?border-top:\s*1px solid var\(--pwa-frame-secondary\)/);
  assert.match(spacing, /\.matrix-tiangong-screen \.tiangong-general-settings \.tiangong-advanced-divider \{[\s\S]*?border-bottom:\s*1px solid var\(--pwa-frame-secondary\)/);
  assert.match(validation, /\.explore-validation-card \{[\s\S]*?border-top-color:\s*var\(--pwa-frame-secondary\)[\s\S]*?border-bottom-color:\s*var\(--pwa-frame-secondary\)/);
  assert.match(homeSwitcher, /var\(--home-frame-bright\) 55%, transparent/);
  assert.doesNotMatch(memberPages, /歡迎使用 樂彩 Matrix。<\/p>/);
  assert.match(memberPages, /歡迎使用 樂彩 Matrix<\/p>/);
  assert.match(css, /border-right-color:\s*var\(--pwa-frame-divider\)/);
});
"""
write(path, text)

# Guardrails: the touched production sources must not gain forbidden override mechanisms.
touched = [
    "src/features/MatrixExplorePage.tsx",
    "src/feature-pages.css",
    "src/matrix-explore-spacing.css",
    "src/explore-result-preview.css",
    "src/homepage/lottery-switcher.css",
    "src/features/MemberPages.tsx",
]
for item in touched:
    source = read(item)
    if "!important" in source:
        raise SystemExit(f"{item}: !important is forbidden")

# Canonical selectors introduced/retained by this patch must remain single-owner declarations.
feature_css = read("src/feature-pages.css")
for selector in [
    ".lottery-tabs {",
    ".lottery-tabs button {",
    ".lottery-tabs button > span {",
    ".lottery-tabs button[data-selected=\"true\"] {",
    ".lottery-tabs button[data-selected=\"true\"] > span {",
]:
    if feature_css.count(selector) != 1:
        raise SystemExit(f"duplicate canonical selector: {selector}")

print("PWA frame unification patch applied and static guardrails passed.")
