from pathlib import Path
import re

css = Path("src/feature-pages.css").read_text()
tsx = Path("src/FeaturePages.tsx").read_text()
start_marker = "/* Matrix Explore formal layout rules */"
end_marker = "/* v55 scoped density and hierarchy refinements */"
start = css.index(start_marker)
end = css.index(end_marker)
formal = css[start:end]
pre = css[:start]
post = css[end:]

legacy_patterns = [
    r'(?m)^\.repeat-stats-heading(?:\s+button|\s*>\s*span)?\s*\{',
    r'(?m)^\.result-title\s*\{',
    r'(?m)^\.consecutive-filter-button\s*\{',
    r'(?m)^\.result-count(?:\s*>\s*span(?:\:nth-child\(2\))?)?\s*\{',
    r'(?m)^\.result-summary(?:\s*>\s*div|\s+b|\s+small)?\s*\{',
    r'(?m)^\.explore-result-disclaimer\s*\{',
]
for pattern in legacy_patterns:
    assert not re.search(pattern, pre), pattern
assert not re.search(r'(?m)^\.repeat-stats-heading\s*>\s*span\s*\{', post)
assert ".matrix-explore-screen .hit-advanced-panel + .primary-action {" not in formal

hit_rules = re.findall(r'\.matrix-explore-screen \.hit-options\s*\{[^}]*\}', formal, re.S)
hit = next(rule for rule in hit_rules if "margin-top:" in rule)
assert "margin-top: 12px;" in hit
assert "padding-bottom: 12px;" in hit
assert "border-bottom: 1px solid rgba(212, 165, 47, .28);" in hit
advanced = re.search(r'\.matrix-explore-screen \.advanced-row\s*\{[^}]*\}', formal, re.S).group(0)
assert "margin: 12px 0 0;" in advanced
assert "border-top:" not in advanced

icon = re.search(r'\.matrix-explore-setting-icon\s*\{[^}]*\}', css, re.S).group(0)
assert "object-fit: contain;" in icon
assert "width: 24px" not in icon
assert "height: 24px" not in icon
assert "flex: 0 0 24px" not in icon
assert re.search(r'\.matrix-explore-screen \.setting-grid label > span \.setting-label-icon,[\s\S]*?width:\s*32px;[^}]*height:\s*32px;', formal)

assert 'useState("本日（最新）")' in tsx
assert '["本日（最新）", "昨日（上1期）", "前日（上2期）"]' in tsx
assert "本日(最新)" not in tsx
assert "昨日(上1期)" not in tsx
assert "前日(上2期)" not in tsx
assert '不保證中獎或<span className="explore-disclaimer-nowrap">獲利</span>。' in tsx
nowrap = re.search(r'\.matrix-explore-screen \.explore-result-disclaimer \.explore-disclaimer-nowrap\s*\{[^}]*\}', formal, re.S).group(0)
assert "white-space: nowrap;" in nowrap

small = re.search(r'\.matrix-explore-screen \.result-summary small\s*\{[^}]*\}', formal, re.S).group(0)
assert "color: #aaa39a;" in small
filt = re.search(r'\.matrix-explore-screen \.consecutive-filter-button\s*\{[^}]*\}', formal, re.S).group(0)
assert "border: 1px solid #aa7b1c;" in filt
assert "background: rgba(128, 87, 13, .18);" in filt
assert "color: #ead295;" in filt

print("document re-audit checks passed")
