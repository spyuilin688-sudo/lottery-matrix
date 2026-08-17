from pathlib import Path
import re


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected once, found {count}")
    return text.replace(old, new, 1)


tsx_path = Path("src/FeaturePages.tsx")
tsx = tsx_path.read_text()
state_anchor = """  const [expanded, setExpanded] = useState(!collapsible);\n\n  return ("""
state_replacement = """  const [expanded, setExpanded] = useState(!collapsible);
  const historyHeading = (
    <div className=\"history-panel-title\">
      <SectionTitle>近10期開獎號碼</SectionTitle>
      <span className=\"history-panel-order\">（{numberOrder}）</span>
    </div>
  );

  return ("""
tsx = replace_once(tsx, state_anchor, state_replacement, "HistoryList state anchor")
title_anchor = '<SectionTitle>近10期開獎號碼（{numberOrder}）</SectionTitle>'
if tsx.count(title_anchor) != 2:
    raise SystemExit(f"HistoryList title: expected twice, found {tsx.count(title_anchor)}")
tsx = tsx.replace(title_anchor, "{historyHeading}")
tsx_path.write_text(tsx)

css_path = Path("src/feature-pages.css")
css = css_path.read_text()
start_marker = ".history-panel {"
end_marker = '.history-panel[data-lottery="六合彩"] .history-special-label { transform: none; }'
start = css.find(start_marker)
end_start = css.find(end_marker, start)
if start < 0 or end_start < 0:
    raise SystemExit("Recent draw formal CSS markers not found")
end = end_start + len(end_marker)

formal = r'''.history-panel {
  box-sizing: border-box;
  width: 366px;
  max-width: 100%;
  min-width: 0;
  margin-top: 12px;
  padding: 0;
  overflow: hidden;
  border-radius: 12px;
}
.panel-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; }
.history-panel .panel-heading {
  display: grid;
  box-sizing: border-box;
  width: 100%;
  height: 52px;
  min-height: 52px;
  padding: 7px 12px;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
  border-bottom: 1px solid rgba(195, 145, 54, .58);
}
.history-panel-title {
  display: grid;
  min-width: 0;
  grid-template-rows: 24px 14px;
  align-content: center;
}
.history-panel-title .section-title {
  min-width: 0;
  min-height: 24px;
  gap: 8px;
  color: #e7d5ac;
  font-size: 15px;
  font-weight: 700;
  line-height: 24px;
  letter-spacing: 0;
  white-space: nowrap;
}
.history-panel-title .section-title > span {
  width: 4px;
  height: 24px;
  flex: 0 0 4px;
  border-radius: 4px;
}
.history-panel-order {
  min-width: 0;
  margin-left: 12px;
  overflow: hidden;
  color: #c6c0b8;
  font-size: 12px;
  font-weight: 500;
  line-height: 14px;
  white-space: nowrap;
}
.history-panel-toggle {
  display: grid;
  min-width: 0;
  padding: 0;
  grid-template-columns: minmax(0, 1fr) 14px;
  align-items: center;
  gap: 4px;
  border: 0;
  background: transparent;
  color: inherit;
  text-align: left;
}
.history-panel-toggle > svg { width: 14px; height: 14px; transition: transform .2s; }
.history-panel-toggle > svg[data-open="true"] { transform: rotate(180deg); }
.panel-heading button { display: flex; align-items: center; border: 0; background: transparent; color: #d8a93e; font-size: 12px; white-space: nowrap; }
.history-panel .panel-heading > button:last-child {
  margin: 0;
  padding: 0;
  gap: 4px;
  justify-self: end;
  color: #d8a93e;
  font-size: 13px;
  font-weight: 500;
  line-height: 18px;
}
.history-panel .panel-heading > button:last-child svg { width: 11px; height: 11px; flex: 0 0 11px; }
.history-table { width: 100%; margin: 0; padding: 0; overflow: hidden; }
.history-row {
  display: grid;
  box-sizing: border-box;
  width: 100%;
  height: 46px;
  min-height: 46px;
  grid-template-columns: 66px 68px minmax(0, 1fr);
  align-items: center;
  border-top: 1px solid rgba(90, 87, 80, .45);
  color: #bcb7ae;
  font-size: 9px;
}
.history-row > span { box-sizing: border-box; min-width: 0; padding: 0; text-align: center; }
.history-row > span + span {
  display: flex;
  align-self: stretch;
  align-items: center;
  justify-content: center;
  border-left: 1px solid rgba(74, 67, 56, .68);
}
.history-row:not(.history-head) > span:first-child,
.history-row:not(.history-head) > span:nth-child(2) {
  display: flex;
  align-self: stretch;
  align-items: center;
  justify-content: center;
  text-align: center;
}
.history-row:not(.history-head) > span:first-child {
  font-size: 14px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  line-height: 18px;
  letter-spacing: 0;
  white-space: nowrap;
}
.history-row:not(.history-head) > span:nth-child(2) { overflow: hidden; color: #fff; }
.history-date-stack {
  display: flex;
  width: 100%;
  min-width: 0;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  white-space: nowrap;
}
.history-date-stack strong { color: #f1eee8; font-size: 12px; font-weight: 700; line-height: 15px; }
.history-date-stack small { max-width: 100%; margin-top: 1px; overflow: hidden; color: #c7c1b8; font-size: 11px; font-weight: 500; line-height: 14px; white-space: nowrap; }
.history-head { height: 36px; min-height: 36px; color: #b58e3e; font-size: 14px; font-weight: 700; line-height: 18px; }
.history-head > span { text-align: center; }
.history-panel .history-row { border-top: 1px solid rgba(90, 87, 80, .45); }
.history-panel .history-head { border-top: 0; border-bottom: 1px solid rgba(195, 145, 54, .58); }
.history-panel .history-head + .history-row { border-top: 0; }
.history-panel .history-row[data-week-boundary="true"] { border-top: 2px solid rgba(166, 124, 54, .68); }
.history-numbers,
.history-main-numbers,
.history-special-number {
  display: flex;
  min-width: 0;
  flex-wrap: nowrap;
  align-items: center;
  justify-content: center;
}
.history-numbers { width: 100%; overflow: hidden; }
.history-main-numbers { gap: 2px; }
.history-special-number { height: 38px; margin-left: 4px; gap: 4px; color: #d4a63b; }
.history-special-number > span:first-child {
  display: grid;
  box-sizing: border-box;
  width: 10px;
  height: 28px;
  flex: 0 0 10px;
  margin: 0;
  place-items: center;
  color: #f6c95f;
  font-size: 14px;
  font-weight: 700;
  line-height: 1;
}
.history-special-ball { display: grid; height: 38px; flex: 0 0 auto; grid-template-rows: 9px 28px; row-gap: 1px; place-items: center; }
.history-special-label { margin: 0; color: #d4a63b; font-size: 9px; font-weight: 600; line-height: 9px; white-space: nowrap; }
.history-panel .history-numbers[data-has-special="true"] .history-main-numbers { gap: 2px; padding-top: 0; }
.history-panel .history-numbers[data-has-special="true"] .history-special-number { height: 38px; margin-left: 4px; gap: 4px; align-items: center; }
.history-panel .history-numbers[data-has-special="true"] .history-special-ball { height: 38px; grid-template-rows: 9px 28px; row-gap: 1px; }
.history-panel .history-numbers[data-has-special="true"] .history-special-label { margin: 0; line-height: 9px; }
.history-panel[data-lottery="六合彩"] .history-special-label { transform: none; }'''
css = css[:start] + formal + css[end:]

# Remove later Matrix Explore sources that re-control the same history panel.
css = css.replace(", .matrix-explore-screen .history-panel {", " {")
css = css.replace(",\n.matrix-explore-screen .history-panel {", " {")
css = css.replace(".matrix-explore-screen .section-title {", ".matrix-explore-screen .section-title:not(.history-panel .section-title) {")
css = css.replace(".matrix-explore-screen .section-title > span {", ".matrix-explore-screen .section-title:not(.history-panel .section-title) > span {")

patterns = [
    r'\.matrix-explore-main-screen \.history-panel \.panel-heading\s*\{[^{}]*\}\s*',
    r'\.matrix-explore-main-screen \.history-panel \.panel-heading \.section-title,\s*\.matrix-explore-main-screen \.history-panel \.panel-heading button\s*\{[^{}]*\}\s*',
    r'\.matrix-explore-main-screen \.history-row\s*\{[^{}]*\}\s*',
    r'\.matrix-explore-main-screen \.history-panel\[data-lottery="六合彩"\] \.history-row\s*\{[^{}]*\}\s*',
    r'\.matrix-explore-main-screen \.history-panel:not\(\[data-lottery="六合彩"\]\) \.history-numbers\[data-has-special="true"\] \.history-main-numbers\s*\{[^{}]*\}\s*',
    r'\.matrix-explore-main-screen \.history-panel \.history-numbers\[data-has-special="true"\] \.history-special-number\s*\{[^{}]*\}\s*',
    r'\.matrix-explore-main-screen \.history-panel\[data-lottery="六合彩"\] \.history-special-number > span:first-child,\s*\.matrix-explore-main-screen \.history-panel\[data-lottery="大樂透"\] \.history-special-number > span:first-child\s*\{[^{}]*\}\s*',
]
for pattern in patterns:
    css = re.sub(pattern, "", css)

if ".matrix-explore-screen .history-panel {" in css:
    raise SystemExit("Matrix Explore padding override for history-panel remains")
if "margin-left: 3px;\n  gap: 2px;" in css:
    raise SystemExit("Old near10 special-number spacing remains")

css_path.write_text(css)
print("Near 10 draw source patch applied")
