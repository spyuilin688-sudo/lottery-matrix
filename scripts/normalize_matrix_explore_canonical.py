from pathlib import Path
import re

path = Path('src/feature-pages.css')
css = path.read_text()
start_marker = '/* Matrix Explore formal layout rules */'
end_marker = '/* v55 scoped density and hierarchy refinements */'
start = css.index(start_marker)
end = css.index(end_marker)
formal = css[start:end]


def replace_rule(selector: str, body: str, expected: int = 1) -> None:
    global formal
    pattern = re.compile(re.escape(selector) + r'\s*\{[^{}]*\}', re.S)
    matches = list(pattern.finditer(formal))
    if len(matches) != expected:
        raise SystemExit(f'{selector}: expected {expected} rule(s), found {len(matches)}')
    formal = pattern.sub(selector + ' {\n' + body.strip() + '\n}', formal, count=1)


def delete_rule(selector: str, expected: int = 1) -> None:
    global formal
    pattern = re.compile(re.escape(selector) + r'\s*\{[^{}]*\}\s*', re.S)
    matches = list(pattern.finditer(formal))
    if len(matches) != expected:
        raise SystemExit(f'{selector}: expected {expected} deletable rule(s), found {len(matches)}')
    formal = pattern.sub('', formal, count=expected)

# Remove legacy main-only grouped size locks; individual canonical rules below own dimensions.
for selector in [
    '.matrix-explore-main-screen .advanced-panel .select-box,\n.matrix-explore-main-screen .advanced-panel .segmented,\n.matrix-explore-main-screen .advanced-panel .segmented button',
    '.matrix-explore-main-screen .hit-options,\n.matrix-explore-main-screen .hit-options button',
    '.matrix-explore-main-screen .explore-settings .setting-grid .select-box,\n.matrix-explore-main-screen .explore-settings .setting-grid .segmented,\n.matrix-explore-main-screen .explore-settings .setting-grid .segmented button',
]:
    delete_rule(selector)

# Separate shared selectors so main gets one explicit source.
shared_title = '.matrix-explore-screen:not(.matrix-explore-main-screen) .setting-grid label > span,\n.matrix-explore-main-screen .advanced-panel label > .advanced-setting-title'
pattern = re.compile(re.escape(shared_title) + r'\s*\{([^{}]*)\}', re.S)
match = pattern.search(formal)
if not match:
    raise SystemExit('shared advanced title rule not found')
formal = pattern.sub('.matrix-explore-screen:not(.matrix-explore-main-screen) .setting-grid label > span {' + match.group(1) + '}', formal, count=1)

shared_select = '.matrix-explore-screen:not(.matrix-explore-main-screen) .setting-grid .select-box,\n.matrix-explore-main-screen .advanced-panel .select-box'
pattern = re.compile(re.escape(shared_select) + r'\s*\{([^{}]*)\}', re.S)
match = pattern.search(formal)
if not match:
    raise SystemExit('shared advanced select rule not found')
formal = pattern.sub('.matrix-explore-screen:not(.matrix-explore-main-screen) .setting-grid .select-box {' + match.group(1) + '}', formal, count=1)

shared_three = '.matrix-explore-screen:not(.matrix-explore-main-screen) .segmented.three,\n.matrix-explore-main-screen .advanced-panel .segmented.three'
pattern = re.compile(re.escape(shared_three) + r'\s*\{([^{}]*)\}', re.S)
match = pattern.search(formal)
if not match:
    raise SystemExit('shared advanced three gap rule not found')
formal = pattern.sub('.matrix-explore-screen:not(.matrix-explore-main-screen) .segmented.three {' + match.group(1) + '}', formal, count=1)

shared_three_buttons = '.matrix-explore-screen:not(.matrix-explore-main-screen) .segmented.three button,\n.matrix-explore-main-screen .advanced-panel .segmented.three button'
pattern = re.compile(re.escape(shared_three_buttons) + r'\s*\{([^{}]*)\}', re.S)
match = pattern.search(formal)
if not match:
    raise SystemExit('shared advanced three button rule not found')
formal = pattern.sub('.matrix-explore-screen:not(.matrix-explore-main-screen) .segmented.three button {' + match.group(1) + '}', formal, count=1)

shared_button = '.matrix-explore-screen:not(.matrix-explore-main-screen) .setting-grid .segmented button,\n.matrix-explore-main-screen .advanced-panel .segmented button,\n.matrix-explore-screen .hit-options button'
pattern = re.compile(re.escape(shared_button) + r'\s*\{([^{}]*)\}', re.S)
match = pattern.search(formal)
if not match:
    raise SystemExit('shared button styling rule not found')
formal = pattern.sub('.matrix-explore-screen:not(.matrix-explore-main-screen) .setting-grid .segmented button,\n.matrix-explore-screen:not(.matrix-explore-main-screen) .hit-options button {' + match.group(1) + '}', formal, count=1)

shared_selected = '.matrix-explore-screen .segmented button[data-selected="true"],\n.matrix-explore-screen .hit-options button[data-selected="true"]'
pattern = re.compile(re.escape(shared_selected) + r'\s*\{[^{}]*\}', re.S)
if len(list(pattern.finditer(formal))) != 1:
    raise SystemExit('shared selected-state rule not found exactly once')
formal = pattern.sub('''.matrix-explore-screen:not(.matrix-explore-main-screen) .segmented button[data-selected="true"],
.matrix-explore-screen:not(.matrix-explore-main-screen) .hit-options button[data-selected="true"] {
  border: 1px solid #d4a52f;
  background: rgba(212, 165, 47, .10);
  color: #f1c75a;
  box-shadow: 0 0 3px rgba(212, 165, 47, .16);
}

.matrix-explore-main-screen .segmented button[data-selected="true"],
.matrix-explore-main-screen .hit-options button[data-selected="true"] {
  border: 1px solid #d4a52f;
  background: rgba(212, 165, 47, .10);
  color: #f1c75a;
  box-shadow: none;
}''', formal, count=1)

replace_rule('.matrix-explore-main-screen .explore-settings,\n.matrix-explore-main-screen .hit-advanced-panel,\n.matrix-explore-main-screen .history-panel,\n.matrix-explore-main-screen .repeat-stats-panel,\n.matrix-explore-main-screen .result-panel', '''
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  height: auto;
  padding: 8px;
  border: 1px solid rgba(108, 74, 32, .50);
  border-radius: 10px;
  background: #071018;
  box-shadow: none;
''')
replace_rule('.matrix-explore-main-screen .panel:not(.explore-settings) .section-title', '''
  min-height: 22px;
  gap: 8px;
  font-size: 15px;
  font-weight: 700;
  line-height: 20px;
  letter-spacing: 0;
''')
replace_rule('.matrix-explore-main-screen .explore-settings > .section-title', '''
  min-height: 22px;
  gap: 8px;
  font-size: 15px;
  font-weight: 700;
  line-height: 20px;
  letter-spacing: 0;
''')
replace_rule('.matrix-explore-main-screen .panel:not(.explore-settings) .section-title > span', 'width: 4px; height: 20px; border-radius: 2px; box-shadow: none;')
replace_rule('.matrix-explore-main-screen .explore-settings > .section-title > span', 'width: 4px; height: 20px; border-radius: 2px; box-shadow: none;')
replace_rule('.matrix-explore-main-screen .explore-settings .setting-grid', 'min-width: 0; width: 100%; margin-top: 8px; gap: 8px;')
replace_rule('.matrix-explore-main-screen .explore-settings .setting-grid label', '''
  min-width: 0;
  width: 100%;
  grid-template-columns: minmax(0, auto) minmax(0, 1fr);
  align-items: center;
  gap: 8px;
''')
replace_rule('.matrix-explore-main-screen .explore-settings .setting-grid label > span', '''
  display: grid;
  min-width: 0;
  grid-template-columns: auto auto;
  align-items: center;
  justify-content: start;
  gap: 8px;
  color: #bdb8b0;
  font-size: 11px;
  font-weight: 600;
  line-height: 18px;
  text-align: left;
  white-space: nowrap;
''')
replace_rule('.matrix-explore-main-screen .explore-settings .setting-grid label > span .setting-label-icon', '''
  width: 24px;
  height: 24px;
  flex: 0 0 24px;
  border-radius: 5px;
  transform: none;
''')
replace_rule('.matrix-explore-main-screen .advanced-panel label', '''
  min-width: 0;
  width: 100%;
  grid-template-columns: minmax(0, auto) minmax(0, 1fr);
  align-items: center;
  gap: 8px;
''')
formal += '\n.matrix-explore-main-screen .advanced-panel label > .advanced-setting-title {\n  display: grid;\n  min-width: 0;\n  grid-template-columns: auto auto;\n  align-items: center;\n  justify-content: start;\n  gap: 8px;\n  color: #bdb8b0;\n  font-size: 11px;\n  font-weight: 600;\n  line-height: 18px;\n  text-align: left;\n  white-space: nowrap;\n}\n'
formal += '.matrix-explore-main-screen .advanced-panel .advanced-setting-title .setting-label-icon {\n  width: 24px;\n  height: 24px;\n  flex: 0 0 24px;\n  border-radius: 5px;\n  transform: none;\n}\n'
replace_rule('.matrix-explore-main-screen .explore-settings .setting-grid .select-box', '''
  width: 100%;
  max-width: none;
  min-width: 0;
  height: 24px;
  min-height: 24px;
  padding: 0;
  font-size: 13px;
  font-weight: 700;
''')
formal += '.matrix-explore-main-screen .advanced-panel .select-box {\n  width: 100%;\n  max-width: none;\n  min-width: 0;\n  height: 24px;\n  min-height: 24px;\n  padding: 0;\n  font-size: 13px;\n  font-weight: 700;\n}\n'
replace_rule('.matrix-explore-main-screen .explore-settings .segmented.three', 'gap: 8px;')
formal += '.matrix-explore-main-screen .advanced-panel .segmented.three {\n  gap: 8px;\n}\n'
replace_rule('.matrix-explore-main-screen .explore-settings .segmented.three button', '''
  min-width: 0;
  height: 24px;
  min-height: 24px;
  padding: 0 3px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 600;
  line-height: 1.15;
  white-space: normal;
  overflow: visible;
''')
formal += '.matrix-explore-main-screen .advanced-panel .segmented.two button {\n  height: 24px;\n  min-height: 24px;\n  padding: 0 3px;\n  border-radius: 8px;\n  font-size: 13px;\n  font-weight: 700;\n  white-space: nowrap;\n  overflow: visible;\n}\n'
formal += '.matrix-explore-main-screen .segmented.two,\n.matrix-explore-main-screen .hit-options {\n  gap: 8px;\n}\n'
replace_rule('.matrix-explore-main-screen .hit-options button', '''
  height: 24px;
  min-height: 24px;
  padding: 0 4px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 700;
  white-space: nowrap;
  overflow: visible;
''')
replace_rule('.matrix-explore-main-screen .advanced-row', '''
  height: 24px;
  min-height: 24px;
  margin: 8px 0 0;
  padding: 0;
  grid-template-columns: 24px minmax(0, 1fr) 12px;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 700;
''')
replace_rule('.matrix-explore-main-screen .advanced-row > img:first-child', 'width: 24px; height: 24px; border-radius: 5px; object-fit: contain;')
replace_rule('.matrix-explore-main-screen .primary-action', '''
  width: 100%;
  height: 32px;
  margin: 8px 0;
  border: 1px solid #d4a52f;
  border-radius: 10px;
  background: #071018;
  color: #f6d472;
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0;
  box-shadow: none;
''')
replace_rule('.matrix-explore-main-screen .repeat-stats-heading button', '''
  height: 24px;
  min-height: 24px;
  padding: 0 7px;
  border: 1px solid rgba(170, 123, 28, .55);
  border-radius: 7px;
  background: rgba(128, 87, 13, .10);
  color: #ead295;
  font-size: 13px;
  font-weight: 600;
''')
replace_rule('.matrix-explore-main-screen .repeat-stats-heading > span', 'color: #9e9a93; font-size: 11px; font-weight: 400; text-align: right; white-space: nowrap;')
replace_rule('.matrix-explore-main-screen .result-summary', 'display: grid; margin-top: 8px; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 8px;')
replace_rule('.matrix-explore-main-screen .explore-result-disclaimer', '''
  box-sizing: border-box;
  width: 100%;
  margin: 0;
  padding: 8px;
  color: #aaa49a;
  font-size: 11px;
  font-weight: 400;
  line-height: 1.45;
  text-align: center;
''')
replace_rule('.matrix-explore-main-screen .consecutive-filter-button', '''
  position: relative;
  min-height: 24px;
  height: 24px;
  padding: 0 8px;
  border: 1px solid #aa7b1c;
  border-radius: 7px;
  background: rgba(128, 87, 13, .18);
  color: #ead295;
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
''')

# Table typography required by the canonical test.
for selector, body in [
    ('.matrix-explore-main-screen .repeat-stats-body', 'font-size: 13px;'),
    ('.matrix-explore-main-screen .repeat-stats-table th', 'font-size: 11px;'),
    ('.matrix-explore-main-screen .repeat-stats-table td', 'font-size: 13px;'),
]:
    pattern = re.compile(re.escape(selector) + r'\s*\{[^{}]*\}', re.S)
    if pattern.search(formal):
        formal = pattern.sub(selector + ' {\n' + body + '\n}', formal, count=1)
    else:
        formal += f'\n{selector} {{\n{body}\n}}\n'

# Strip main-only decorative hard pulls/shadows from formal scope.
formal = formal.replace('.matrix-explore-screen .panel {', '.matrix-explore-screen:not(.matrix-explore-main-screen) .panel {', 1)
formal = formal.replace('.matrix-explore-screen .branded-explore-action::before {', '.matrix-explore-screen:not(.matrix-explore-main-screen) .branded-explore-action::before {', 1)
formal = formal.replace('.matrix-explore-screen .branded-explore-action::after {', '.matrix-explore-screen:not(.matrix-explore-main-screen) .branded-explore-action::after {', 1)

css = css[:start] + formal.rstrip() + '\n\n' + css[end:]
path.write_text(css)
