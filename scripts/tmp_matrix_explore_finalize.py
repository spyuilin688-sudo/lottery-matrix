from pathlib import Path
import re

path = Path("src/feature-pages.css")
css = path.read_text()
start_marker = "/* Matrix Explore formal layout rules */"
end_marker = "/* v55 scoped density and hierarchy refinements */"
start = css.index(start_marker)
end = css.index(end_marker)
formal = css[start:end]


def replace_rule(selector: str, body: str) -> None:
    global formal
    pattern = re.compile(re.escape(selector) + r"\s*\{[^{}]*\}", re.S)
    matches = list(pattern.finditer(formal))
    if len(matches) != 1:
        raise SystemExit(f"{selector}: expected 1 rule, found {len(matches)}")
    formal = pattern.sub(selector + " {\n" + body.strip() + "\n}", formal)


shared_select = ".matrix-explore-screen:not(.matrix-explore-main-screen) .setting-grid .select-box,\n.matrix-explore-main-screen .advanced-panel .select-box"
pattern = re.compile(re.escape(shared_select) + r"\s*\{([^{}]*)\}", re.S)
match = pattern.search(formal)
if not match:
    raise SystemExit("shared advanced select source not found")
nonmain_select = ".matrix-explore-screen:not(.matrix-explore-main-screen) .setting-grid .select-box {" + match.group(1) + "}"
main_select = """.matrix-explore-main-screen .advanced-panel .select-box {
  width: 100%;
  max-width: none;
  min-width: 0;
  height: 24px;
  min-height: 24px;
  padding: 0;
  font-size: 13px;
  font-weight: 700;
}"""
formal = pattern.sub(nonmain_select + "\n\n" + main_select, formal, count=1)

old_group = ".matrix-explore-main-screen .advanced-panel .select-box,\n.matrix-explore-main-screen .advanced-panel .segmented,\n.matrix-explore-main-screen .advanced-panel .segmented button"
if old_group not in formal:
    raise SystemExit("main advanced height group not found")
formal = formal.replace(
    old_group,
    ".matrix-explore-main-screen .advanced-panel .segmented,\n.matrix-explore-main-screen .advanced-panel .segmented button",
    1,
)

shared_title = ".matrix-explore-screen:not(.matrix-explore-main-screen) .setting-grid label > span,\n.matrix-explore-main-screen .advanced-panel label > .advanced-setting-title"
pattern = re.compile(re.escape(shared_title) + r"\s*\{([^{}]*)\}", re.S)
match = pattern.search(formal)
if not match:
    raise SystemExit("shared advanced label source not found")
nonmain_title = ".matrix-explore-screen:not(.matrix-explore-main-screen) .setting-grid label > span {" + match.group(1) + "}"
main_title = """.matrix-explore-main-screen .advanced-panel label > .advanced-setting-title {
  display: grid;
  width: 100%;
  min-width: 0;
  grid-template-columns: 32px minmax(0, 1fr);
  align-items: center;
  gap: 8px;
  color: #bdb8b0;
  font-size: 11px;
  font-weight: 600;
  line-height: 18px;
  text-align: left;
  white-space: nowrap;
}"""
formal = pattern.sub(nonmain_title + "\n\n" + main_title, formal, count=1)

shared_three = ".matrix-explore-screen:not(.matrix-explore-main-screen) .segmented.three,\n.matrix-explore-main-screen .advanced-panel .segmented.three"
pattern = re.compile(re.escape(shared_three) + r"\s*\{([^{}]*)\}", re.S)
match = pattern.search(formal)
if not match:
    raise SystemExit("shared advanced three-column gap source not found")
nonmain_three = ".matrix-explore-screen:not(.matrix-explore-main-screen) .segmented.three {" + match.group(1) + "}"
main_three = ".matrix-explore-main-screen .advanced-panel .segmented.three {\n  gap: 8px;\n}"
formal = pattern.sub(nonmain_three + "\n\n" + main_three, formal, count=1)

replace_rule(
    ".matrix-explore-main-screen .advanced-row",
    """
  height: 24px;
  min-height: 24px;
  margin: 8px 0 0;
  padding: 0;
  grid-template-columns: 24px minmax(0, 1fr) 12px;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 700;
""",
)
replace_rule(
    ".matrix-explore-main-screen .advanced-row > img:first-child",
    """
  width: 24px;
  height: 24px;
  border-radius: 5px;
  object-fit: contain;
""",
)
replace_rule(".matrix-explore-main-screen .repeat-stats-body", "font-size: 13px;")
replace_rule(".matrix-explore-main-screen .repeat-stats-table th", "font-size: 11px;")
replace_rule(".matrix-explore-main-screen .repeat-stats-table td", "font-size: 13px;")
replace_rule(
    ".matrix-explore-main-screen .explore-result-disclaimer",
    """
  box-sizing: border-box;
  width: 100%;
  margin: 0;
  padding: 8px;
  color: #aaa49a;
  font-size: 11px;
  font-weight: 400;
  line-height: 1.45;
  text-align: center;
""",
)

css = css[:start] + formal + css[end:]
path.write_text(css)
