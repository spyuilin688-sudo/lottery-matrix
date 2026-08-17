from pathlib import Path
import re

path = Path("src/feature-pages.css")
css = path.read_text()
start_marker = "/* Matrix Explore formal layout rules */"
end_marker = "/* v55 scoped density and hierarchy refinements */"
start = css.index(start_marker)
end = css.index(end_marker)
formal = css[start:end]


def replace_rule(selector: str, body: str, expected: int = 1) -> None:
    global formal
    pattern = re.compile(re.escape(selector) + r"\s*\{[^{}]*\}", re.S)
    matches = list(pattern.finditer(formal))
    if len(matches) != expected:
        raise SystemExit(f"{selector!r}: expected {expected} rule(s), found {len(matches)}")
    formal = pattern.sub(selector + " {\n" + body.strip() + "\n}", formal)


replace_rule(
    ".matrix-explore-screen .panel",
    """
  border: 1px solid rgba(108, 74, 32, .50);
  border-radius: 12px;
  background: linear-gradient(145deg, rgba(8, 16, 22, .96), rgba(2, 8, 13, .98));
  box-shadow: none;
""",
)
formal = formal.replace(
    ".matrix-explore-screen .panel {",
    ".matrix-explore-screen:not(.matrix-explore-main-screen) .panel {",
    1,
)

replace_rule(
    ".matrix-explore-main-screen .explore-settings,\n.matrix-explore-main-screen .hit-advanced-panel,\n.matrix-explore-main-screen .history-panel,\n.matrix-explore-main-screen .repeat-stats-panel,\n.matrix-explore-main-screen .result-panel",
    """
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  height: auto;
  padding: 8px;
  border: 1px solid rgba(108, 74, 32, .50);
  border-radius: 10px;
  background: #071018;
  box-shadow: none;
""",
)
replace_rule(
    ".matrix-explore-main-screen .panel:not(.explore-settings) .section-title",
    """
  min-height: 22px;
  gap: 8px;
  font-size: 15px;
  font-weight: 700;
  line-height: 20px;
  letter-spacing: 0;
""",
)
replace_rule(
    ".matrix-explore-main-screen .explore-settings > .section-title",
    """
  min-height: 22.4px;
  gap: 8px;
  font-size: 15px;
  font-weight: 700;
  line-height: 20.8px;
  letter-spacing: 0;
""",
)
replace_rule(
    ".matrix-explore-main-screen .panel:not(.explore-settings) .section-title > span",
    """
  width: 4px;
  height: 20px;
  border-radius: 2px;
  box-shadow: none;
""",
)
replace_rule(
    ".matrix-explore-main-screen .explore-settings > .section-title > span",
    """
  width: 3.2px;
  height: 19.2px;
  border-radius: 1.6px;
  box-shadow: none;
""",
)
replace_rule(
    ".matrix-explore-main-screen .explore-settings .setting-grid",
    """
  min-width: 0;
  width: 100%;
  margin-top: 8px;
  gap: 8px;
""",
)
replace_rule(
    ".matrix-explore-main-screen .explore-settings .setting-grid label",
    """
  min-width: 0;
  width: 100%;
  min-height: 38px;
  grid-template-columns: 104px minmax(0, 1fr);
  align-items: center;
  gap: 8px;
""",
)
replace_rule(
    ".matrix-explore-main-screen .explore-settings .setting-grid label > span",
    """
  display: grid;
  width: 100%;
  min-width: 0;
  grid-template-columns: 38px minmax(0, 1fr);
  align-items: center;
  gap: 8px;
  color: #bdb8b0;
  font-size: 11px;
  font-weight: 600;
  line-height: 18px;
  text-align: left;
  white-space: nowrap;
""",
)
replace_rule(
    ".matrix-explore-main-screen .advanced-panel .select-box,\n.matrix-explore-main-screen .advanced-panel .segmented,\n.matrix-explore-main-screen .advanced-panel .segmented button",
    """
  height: 24px;
  min-height: 24px;
""",
)
replace_rule(
    ".matrix-explore-main-screen .hit-options,\n.matrix-explore-main-screen .hit-options button",
    """
  height: 24px;
  min-height: 24px;
  padding: 0 4px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 700;
  white-space: nowrap;
  overflow: visible;
""",
)
formal = formal.replace(
    ".matrix-explore-main-screen .hit-options,\n.matrix-explore-main-screen .hit-options button {",
    ".matrix-explore-main-screen .hit-options {",
    1,
)
replace_rule(
    ".matrix-explore-main-screen .explore-settings .setting-grid .select-box,\n.matrix-explore-main-screen .explore-settings .setting-grid .segmented,\n.matrix-explore-main-screen .explore-settings .setting-grid .segmented button",
    """
  height: 24px;
  min-height: 24px;
""",
)
old_selector = ".matrix-explore-screen:not(.matrix-explore-main-screen) .setting-grid .segmented button,\n.matrix-explore-main-screen .advanced-panel .segmented button,\n.matrix-explore-screen .hit-options button"
new_selector = ".matrix-explore-screen:not(.matrix-explore-main-screen) .setting-grid .segmented button,\n.matrix-explore-main-screen .advanced-panel .segmented button,\n.matrix-explore-screen:not(.matrix-explore-main-screen) .hit-options button"
if old_selector not in formal:
    raise SystemExit("shared hit-option selector not found")
formal = formal.replace(old_selector, new_selector, 1)
replace_rule(
    ".matrix-explore-main-screen .explore-settings .setting-grid .select-box",
    """
  width: 100%;
  max-width: none;
  min-width: 0;
  height: 24px;
  min-height: 24px;
  padding: 0;
  font-size: 13px;
  font-weight: 700;
""",
)
replace_rule(".matrix-explore-main-screen .explore-settings .segmented.three", "gap: 8px;")
replace_rule(
    ".matrix-explore-main-screen .explore-settings .segmented.three button",
    """
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
""",
)
replace_rule(
    ".matrix-explore-screen .segmented.two,\n.matrix-explore-screen .hit-options",
    "gap: 8px;",
)
formal = formal.replace(
    ".matrix-explore-screen .segmented.two,\n.matrix-explore-screen .hit-options {",
    ".matrix-explore-screen:not(.matrix-explore-main-screen) .segmented.two,\n.matrix-explore-screen:not(.matrix-explore-main-screen) .hit-options,\n.matrix-explore-main-screen .segmented.two,\n.matrix-explore-main-screen .hit-options {",
    1,
)
replace_rule(
    ".matrix-explore-main-screen .advanced-panel .segmented.two button",
    """
  height: 24px;
  min-height: 24px;
  padding: 0 3px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 700;
  white-space: nowrap;
  overflow: visible;
""",
)
replace_rule(
    ".matrix-explore-main-screen .hit-options button",
    """
  height: 24px;
  min-height: 24px;
  padding: 0 4px;
  border-radius: 9px;
  font-size: 13px;
  font-weight: 700;
  white-space: nowrap;
  overflow: visible;
""",
)
shared_selected = ".matrix-explore-screen .segmented button[data-selected=\"true\"],\n.matrix-explore-screen .hit-options button[data-selected=\"true\"]"
pattern = re.compile(re.escape(shared_selected) + r"\s*\{[^{}]*\}", re.S)
if len(list(pattern.finditer(formal))) != 1:
    raise SystemExit("shared selected-state rule not found exactly once")
formal = pattern.sub(
    """.matrix-explore-screen:not(.matrix-explore-main-screen) .segmented button[data-selected="true"],
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
}""",
    formal,
)
replace_rule(
    ".matrix-explore-screen .advanced-panel",
    """
  min-width: 0;
  width: 100%;
  padding-top: 8px;
  gap: 8px;
""",
)
formal = formal.replace(
    ".matrix-explore-screen .advanced-panel {",
    ".matrix-explore-screen:not(.matrix-explore-main-screen) .advanced-panel,\n.matrix-explore-main-screen .advanced-panel {",
    1,
)
replace_rule(
    ".matrix-explore-main-screen .primary-action",
    """
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
""",
)
formal = formal.replace(
    ".matrix-explore-screen .branded-explore-action::before {",
    ".matrix-explore-screen:not(.matrix-explore-main-screen) .branded-explore-action::before {",
    1,
)
formal = formal.replace(
    ".matrix-explore-screen .branded-explore-action::after {",
    ".matrix-explore-screen:not(.matrix-explore-main-screen) .branded-explore-action::after {",
    1,
)
replace_rule(
    ".matrix-explore-main-screen .history-panel .panel-heading .section-title",
    """
  min-width: 0;
  font-size: 15px;
  font-weight: 700;
  line-height: 17px;
  white-space: normal;
""",
)
replace_rule(
    ".matrix-explore-main-screen .road-result-row > strong",
    """
  font-size: 13px;
  font-weight: 700;
""",
)
replace_rule(
    ".matrix-explore-main-screen .repeat-stats-heading .section-title,\n.matrix-explore-main-screen .result-title .section-title",
    """
  font-size: 15px;
  font-weight: 700;
""",
)
replace_rule(
    ".matrix-explore-main-screen .repeat-stats-heading button",
    """
  height: 24px;
  min-height: 24px;
  padding: 0 7px;
  border: 1px solid rgba(170, 123, 28, .55);
  border-radius: 7px;
  background: rgba(128, 87, 13, .10);
  color: #ead295;
  font-size: 13px;
  font-weight: 600;
""",
)
replace_rule(
    ".matrix-explore-main-screen .result-summary",
    """
  display: grid;
  margin-top: 8px;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 8px;
""",
)
replace_rule(".matrix-explore-main-screen .result-panel", "padding-top: 8px;")
replace_rule(
    ".matrix-explore-main-screen .consecutive-filter-button",
    """
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
""",
)

main_rule_parts = []
for match in re.finditer(r"([^{}]+)\{([^{}]*)\}", formal):
    selector, body = match.groups()
    parts = selector.split(",")
    if any(
        ".matrix-explore-main-screen" in part
        and ":not(.matrix-explore-main-screen)" not in part
        for part in parts
    ):
        main_rule_parts.append(f"{selector}{{{body}}}")
main_rules = "\n".join(main_rule_parts)
for pattern_text, label in [
    (r"box-shadow:\s*(?!none)", "non-none box-shadow"),
    (r"text-shadow\s*:", "text-shadow"),
    (r"filter:\s*drop-shadow", "drop-shadow"),
    (r"(?:linear|radial)-gradient\s*\(", "gradient"),
    (r"margin(?:-[a-z]+)?:\s*-\d", "negative margin"),
    (r"translate(?:X|Y)?\s*\(", "translate hard pull"),
    (r"border(?:-width)?:\s*(?:[2-9]|\d{2,})px", "thick border"),
]:
    if re.search(pattern_text, main_rules, re.I):
        raise SystemExit(f"forbidden {label} remains in main formal rules")

css = css[:start] + formal + css[end:]
path.write_text(css)
