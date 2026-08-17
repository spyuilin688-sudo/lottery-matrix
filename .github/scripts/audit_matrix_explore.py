from pathlib import Path
import re
import sys

FORMAL_START = "/* Matrix Explore formal layout rules */"
FORMAL_END = "/* v55 scoped density and hierarchy refinements */"


def read_sources():
    css = Path("src/feature-pages.css").read_text()
    tsx = Path("src/FeaturePages.tsx").read_text()
    start = css.index(FORMAL_START)
    end = css.index(FORMAL_END)
    formal = css[start:end]
    pre = css[:start]
    post = css[end:]
    return css, tsx, formal, pre, post


def check():
    css, tsx, formal, pre, post = read_sources()

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

    hit = re.search(r'\.matrix-explore-screen \.hit-options\s*\{[^}]*\}', formal, re.S).group(0)
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
    formal_icon = re.search(r'\.matrix-explore-screen \.setting-grid label > span \.setting-label-icon,[\s\S]*?\}', formal).group(0)
    assert "width: 32px;" in formal_icon and "height: 32px;" in formal_icon

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


def patch():
    css_path = Path("src/feature-pages.css")
    css = css_path.read_text()
    assert css.count(FORMAL_START) == 1
    pre, formal_and_after = css.split(FORMAL_START, 1)

    patterns = [
        r'(?m)^\.repeat-stats-heading\s*\{[^{}]*\}\n?',
        r'(?m)^\.repeat-stats-heading button\s*\{[^{}]*\}\n?',
        r'(?m)^\.repeat-stats-heading > span\s*\{[^{}]*\}\n?',
        r'(?m)^\.result-title\s*\{[^{}]*\}\n?',
        r'(?m)^\.consecutive-filter-button\s*\{[^{}]*\}\n?',
        r'(?m)^\.result-count\s*\{[^{}]*\}\n?',
        r'(?m)^\.result-count > span\s*\{[^{}]*\}\n?',
        r'(?m)^\.result-count > span:nth-child\(2\)\s*\{[^{}]*\}\n?',
        r'(?m)^\.result-summary\s*\{[^{}]*\}\n?',
        r'(?m)^\.result-summary > div\s*\{[^{}]*\}\n?',
        r'(?m)^\.result-summary b\s*\{[^{}]*\}\n?',
        r'(?m)^\.result-summary small\s*\{[^{}]*\}\n?',
        r'(?m)^\.explore-result-disclaimer\s*\{[^{}]*\}\n?',
    ]
    removed = 0
    for pattern in patterns:
        pre, count = re.subn(pattern, "", pre)
        removed += count
    assert removed >= 14, removed
    css = pre + FORMAL_START + formal_and_after

    replacements = [
        (
            ".matrix-explore-setting-icon { display: block; width: 24px; height: 24px; flex: 0 0 24px; object-fit: cover; border-radius: 6px; }",
            ".matrix-explore-setting-icon { display: block; object-fit: contain; border-radius: 6px; }",
        ),
        (
            ".matrix-explore-screen .hit-advanced-panel + .primary-action {\nmargin-top: 12px;\n}\n\n",
            "",
        ),
        (
            ".matrix-explore-screen .hit-options {\nmargin-top: 12px;\n}",
            ".matrix-explore-screen .hit-options {\nmargin-top: 12px; padding-bottom: 12px; border-bottom: 1px solid rgba(212, 165, 47, .28);\n}",
        ),
        (
            "height: 44px; min-height: 44px; margin: 12px 0 0; padding: 0; grid-template-columns: 32px minmax(0, 1fr) 14px; align-items: center; border-top: 1px solid rgba(212, 165, 47, .28); font-size: 17px; font-weight: 700;",
            "height: 44px; min-height: 44px; margin: 12px 0 0; padding: 0; grid-template-columns: 32px minmax(0, 1fr) 14px; align-items: center; font-size: 17px; font-weight: 700;",
        ),
        (
            ".matrix-explore-screen .result-summary small {\nmargin-top: 1px; font-size: 11px; font-weight: 400; line-height: 13px;\n}",
            ".matrix-explore-screen .result-summary small {\nmargin-top: 1px; color: #aaa39a; font-size: 11px; font-weight: 400; line-height: 13px;\n}",
        ),
        (
            ".matrix-explore-screen .explore-result-disclaimer {\nbox-sizing: border-box; width: 100%; margin: 0; padding: 14px 12px; color: #aaa49a; font-size: 13px; font-weight: 400; line-height: 1.55; text-align: center;\n}\n",
            ".matrix-explore-screen .explore-result-disclaimer {\nbox-sizing: border-box; width: 100%; margin: 0; padding: 14px 12px; color: #aaa49a; font-size: 13px; font-weight: 400; line-height: 1.55; text-align: center;\n}\n\n.matrix-explore-screen .explore-result-disclaimer .explore-disclaimer-nowrap {\nwhite-space: nowrap;\n}\n",
        ),
        (
            ".matrix-explore-screen .consecutive-filter-button {\nposition: relative; min-height: 28px; height: 28px; padding: 0 10px; border-radius: 8px; font-size: 13px; font-weight: 600; white-space: nowrap;\n}",
            ".matrix-explore-screen .consecutive-filter-button {\nposition: relative; min-height: 28px; height: 28px; padding: 0 10px; border: 1px solid #aa7b1c; border-radius: 8px; background: rgba(128, 87, 13, .18); color: #ead295; font-size: 13px; font-weight: 600; white-space: nowrap;\n}",
        ),
        (
            ".repeat-stats-heading > span {\n  color: #9e9a93;\n}\n\n",
            "",
        ),
    ]
    for old, new in replacements:
        assert css.count(old) == 1, old[:80]
        css = css.replace(old, new, 1)
    css_path.write_text(css)

    tsx_path = Path("src/FeaturePages.tsx")
    tsx = tsx_path.read_text()
    assert tsx.count("本日(最新)") == 2
    assert tsx.count("昨日(上1期)") == 1
    assert tsx.count("前日(上2期)") == 1
    tsx = tsx.replace("本日(最新)", "本日（最新）")
    tsx = tsx.replace("昨日(上1期)", "昨日（上1期）")
    tsx = tsx.replace("前日(上2期)", "前日（上2期）")
    old_copy = "探索結果依歷史資料與所選條件產生，僅供參考之用，不保證中獎或獲利。"
    new_copy = '探索結果依歷史資料與所選條件產生，僅供參考之用，不保證中獎或<span className="explore-disclaimer-nowrap">獲利</span>。'
    assert tsx.count(old_copy) == 1
    tsx = tsx.replace(old_copy, new_copy, 1)
    tsx_path.write_text(tsx)


if sys.argv[1] == "check":
    check()
elif sys.argv[1] == "patch":
    patch()
else:
    raise SystemExit("unknown mode")
