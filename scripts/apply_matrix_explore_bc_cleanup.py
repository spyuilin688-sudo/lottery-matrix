from pathlib import Path
import re

path = Path('src/feature-pages.css')
css = path.read_text()
start_marker = '/* Matrix Explore formal layout rules */'
end_marker = '/* v55 scoped density and hierarchy refinements */'
start = css.index(start_marker)
end = css.index(end_marker)
formal = css[start:end]


def replace_rule(selector: str, body: str) -> None:
    global formal
    pattern = re.compile(re.escape(selector) + r'\s*\{[^{}]*\}', re.S)
    matches = list(pattern.finditer(formal))
    if len(matches) != 1:
        raise SystemExit(f'{selector}: expected 1 rule, found {len(matches)}')
    formal = pattern.sub(selector + ' {\n' + body.strip() + '\n}', formal, count=1)


# Main Explore cards: reference-like internal spacing, one canonical source.
replace_rule(
    '.matrix-explore-main-screen .explore-settings,\n.matrix-explore-main-screen .hit-advanced-panel,\n.matrix-explore-main-screen .history-panel,\n.matrix-explore-main-screen .repeat-stats-panel,\n.matrix-explore-main-screen .result-panel',
    '''
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  height: auto;
  padding: 8px;
  border-radius: 10px;
  box-shadow: none;
''',
)

# Split main advanced controls away from non-main controls so later shared rules cannot enlarge them.
shared_select = '.matrix-explore-screen:not(.matrix-explore-main-screen) .setting-grid .select-box,\n.matrix-explore-main-screen .advanced-panel .select-box'
pattern = re.compile(re.escape(shared_select) + r'\s*\{([^{}]*)\}', re.S)
match = pattern.search(formal)
if not match:
    raise SystemExit('shared advanced select rule not found')
formal = pattern.sub(
    '.matrix-explore-screen:not(.matrix-explore-main-screen) .setting-grid .select-box {' + match.group(1) + '}\n\n'
    '.matrix-explore-main-screen .advanced-panel .select-box {\n'
    '  width: 100%;\n  max-width: none;\n  min-width: 0;\n  height: 36px;\n  min-height: 36px;\n'
    '  padding: 0;\n  font-size: 13px;\n  font-weight: 700;\n}',
    formal,
    count=1,
)

shared_title = '.matrix-explore-screen:not(.matrix-explore-main-screen) .setting-grid label > span,\n.matrix-explore-main-screen .advanced-panel label > .advanced-setting-title'
pattern = re.compile(re.escape(shared_title) + r'\s*\{([^{}]*)\}', re.S)
match = pattern.search(formal)
if not match:
    raise SystemExit('shared advanced title rule not found')
formal = pattern.sub(
    '.matrix-explore-screen:not(.matrix-explore-main-screen) .setting-grid label > span {' + match.group(1) + '}\n\n'
    '.matrix-explore-main-screen .advanced-panel label > .advanced-setting-title {\n'
    '  display: grid;\n  width: 100%;\n  min-width: 0;\n  grid-template-columns: 32px minmax(0, 1fr);\n'
    '  align-items: center;\n  gap: 8px;\n  color: #bdb8b0;\n  font-size: 13px;\n  font-weight: 600;\n'
    '  line-height: 18px;\n  text-align: left;\n  white-space: nowrap;\n}',
    formal,
    count=1,
)

shared_three = '.matrix-explore-screen:not(.matrix-explore-main-screen) .segmented.three,\n.matrix-explore-main-screen .advanced-panel .segmented.three'
pattern = re.compile(re.escape(shared_three) + r'\s*\{([^{}]*)\}', re.S)
match = pattern.search(formal)
if not match:
    raise SystemExit('shared advanced three-column gap rule not found')
formal = pattern.sub(
    '.matrix-explore-screen:not(.matrix-explore-main-screen) .segmented.three {' + match.group(1) + '}\n\n'
    '.matrix-explore-main-screen .advanced-panel .segmented.three {\n  gap: 8px;\n}',
    formal,
    count=1,
)

shared_three_buttons = '.matrix-explore-screen:not(.matrix-explore-main-screen) .segmented.three button,\n.matrix-explore-main-screen .advanced-panel .segmented.three button'
pattern = re.compile(re.escape(shared_three_buttons) + r'\s*\{([^{}]*)\}', re.S)
match = pattern.search(formal)
if not match:
    raise SystemExit('shared advanced three-column button rule not found')
formal = pattern.sub(
    '.matrix-explore-screen:not(.matrix-explore-main-screen) .segmented.three button {' + match.group(1) + '}\n\n'
    '.matrix-explore-main-screen .advanced-panel .segmented.three button {\n'
    '  min-width: 0;\n  height: 36px;\n  min-height: 36px;\n  padding: 0 3px;\n  border-radius: 8px;\n'
    '  font-size: 12px;\n  font-weight: 700;\n  line-height: 1.15;\n  white-space: normal;\n  overflow: visible;\n}',
    formal,
    count=1,
)

# Use the already-approved reference proportions for the main screen.
replace_rule(
    '.matrix-explore-main-screen .hit-options button',
    '''
  height: 34px;
  min-height: 34px;
  padding: 0 4px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 700;
  white-space: nowrap;
  overflow: visible;
''',
)
replace_rule(
    '.matrix-explore-main-screen .advanced-row',
    '''
  height: 38px;
  min-height: 38px;
  margin: 8px 0 0;
  padding: 0;
  grid-template-columns: 34px minmax(0, 1fr) 12px;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 700;
''',
)
replace_rule(
    '.matrix-explore-main-screen .advanced-row > img:first-child',
    '''
  width: 34px;
  height: 34px;
  border-radius: 5px;
  object-fit: contain;
''',
)
replace_rule(
    '.matrix-explore-main-screen .primary-action',
    '''
  width: 100%;
  height: 40px;
  margin: 8px 0 12px;
  border: 1px solid #d4a52f;
  border-radius: 10px;
  background: #071018;
  color: #f6d472;
  font-size: 17px;
  font-weight: 700;
  letter-spacing: 0;
  box-shadow: 0 0 4px rgba(212, 165, 47, .18);
''',
)

# Main selected controls get a single state source without a second glow override.
shared_selected = '.matrix-explore-screen .segmented button[data-selected="true"],\n.matrix-explore-screen .hit-options button[data-selected="true"]'
pattern = re.compile(re.escape(shared_selected) + r'\s*\{[^{}]*\}', re.S)
if len(list(pattern.finditer(formal))) != 1:
    raise SystemExit('shared selected-state rule not found exactly once')
formal = pattern.sub(
    '''.matrix-explore-screen:not(.matrix-explore-main-screen) .segmented button[data-selected="true"],
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
}''',
    formal,
    count=1,
)

# Keep the compact table/stat/result proportions already represented by the reference.
replace_rule('.matrix-explore-main-screen .result-summary', '''
  display: grid;
  margin-top: 8px;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 5px;
''')
replace_rule('.matrix-explore-main-screen .explore-result-disclaimer', '''
  box-sizing: border-box;
  width: 100%;
  margin: 0;
  padding: 10px;
  color: #aaa49a;
  font-size: 11px;
  font-weight: 400;
  line-height: 1.45;
  text-align: center;
''')

css = css[:start] + formal + css[end:]
path.write_text(css)
