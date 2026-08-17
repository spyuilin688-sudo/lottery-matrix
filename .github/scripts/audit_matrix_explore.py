from pathlib import Path
import re
import sys
import base64

TEST_APPEND = base64.b64decode('Ly8gTWF0cml4IEV4cGxvcmUgZG9jdW1lbnQgcmUtYXVkaXQgY2hlY2tzCgp0ZXN0KCJNYXRyaXggRXhwbG9yZSByZW1vdmVzIGxlZ2FjeSBkdXBsaWNhdGUgcmVzdWx0IGxheW91dCBzb3VyY2VzIiwgKCkgPT4gewogIGFzc2VydC5kb2VzTm90TWF0Y2gocHJlRm9ybWFsLCAvKD9tKV5cLnJlcGVhdC1zdGF0cy1oZWFkaW5nKD86XHMrYnV0dG9ufFxzKj5ccypzcGFuKT9ccypcey8pOwogIGFzc2VydC5kb2VzTm90TWF0Y2gocHJlRm9ybWFsLCAvKD9tKV5cLnJlc3VsdC10aXRsZVxzKlx7Lyk7CiAgYXNzZXJ0LmRvZXNOb3RNYXRjaChwcmVGb3JtYWwsIC8oP20pXlwuY29uc2VjdXRpdmUtZmlsdGVyLWJ1dHRvblxzKlx7Lyk7CiAgYXNzZXJ0LmRvZXNOb3RNYXRjaChwcmVGb3JtYWwsIC8oP20pXlwucmVzdWx0LWNvdW50KD86XHMqPlxzKnNwYW4oPzpcOm50aC1jaGlsZFwoMlwpKT8pP1xzKlx7Lyk7CiAgYXNzZXJ0LmRvZXNOb3RNYXRjaChwcmVGb3JtYWwsIC8oP20pXlwucmVzdWx0LXN1bW1hcnkoPzpccyo+XHMqZGl2fFxzK2J8XHMrc21hbGwpP1xzKlx7Lyk7CiAgYXNzZXJ0LmRvZXNOb3RNYXRjaChwcmVGb3JtYWwsIC8oP20pXlwuZXhwbG9yZS1yZXN1bHQtZGlzY2xhaW1lclxzKlx7Lyk7CiAgYXNzZXJ0LmRvZXNOb3RNYXRjaChwb3N0Rm9ybWFsLCAvKD9tKV5cLnJlcGVhdC1zdGF0cy1oZWFkaW5nXHMqPlxzKnNwYW5ccypcey8pOwogIGFzc2VydC5kb2VzTm90TWF0Y2goZm9ybWFsLCAvXC5tYXRyaXgtZXhwbG9yZS1zY3JlZW4gXC5oaXQtYWR2YW5jZWQtcGFuZWwgXCsgXC5wcmltYXJ5LWFjdGlvblxzKlx7Lyk7Cn0pOwoKdGVzdCgiTWF0cml4IEV4cGxvcmUgaGl0IGRpdmlkZXIga2VlcHMgMTJweCBzcGFjZSBvbiBib3RoIHNpZGVzIiwgKCkgPT4gewogIGFzc2VydC5tYXRjaChmb3JtYWwsIC9cLm1hdHJpeC1leHBsb3JlLXNjcmVlbiBcLmhpdC1vcHRpb25zXHMqXHtbXn1dKm1hcmdpbi10b3A6XHMqMTJweDtbXn1dKnBhZGRpbmctYm90dG9tOlxzKjEycHg7W159XSpib3JkZXItYm90dG9tOlxzKjFweCBzb2xpZCByZ2JhXCgyMTIsXHMqMTY1LFxzKjQ3LFxzKlwuMjhcKTsvc2cpOwogIGNvbnN0IGFkdmFuY2VkUnVsZSA9IGZvcm1hbC5tYXRjaCgvXC5tYXRyaXgtZXhwbG9yZS1zY3JlZW4gXC5hZHZhbmNlZC1yb3dccypce1tefV0qXH0vcyk/LlswXSA/PyAiIjsKICBhc3NlcnQubWF0Y2goYWR2YW5jZWRSdWxlLCAvbWFyZ2luOlxzKjEycHggMCAwOy8pOwogIGFzc2VydC5kb2VzTm90TWF0Y2goYWR2YW5jZWRSdWxlLCAvYm9yZGVyLXRvcDovKTsKfSk7Cgp0ZXN0KCJNYXRyaXggRXhwbG9yZSBzZXR0aW5nIGljb25zIHVzZSBvbmUgMzJweCBzaXplIHNvdXJjZSB3aXRob3V0IGNyb3BwaW5nIiwgKCkgPT4gewogIGNvbnN0IGljb25SdWxlID0gY3NzLm1hdGNoKC9cLm1hdHJpeC1leHBsb3JlLXNldHRpbmctaWNvblxzKlx7W159XSpcfS9zKT8uWzBdID8/ICIiOwogIGFzc2VydC5tYXRjaChpY29uUnVsZSwgL29iamVjdC1maXQ6XHMqY29udGFpbjsvKTsKICBhc3NlcnQuZG9lc05vdE1hdGNoKGljb25SdWxlLCAvKD86d2lkdGh8aGVpZ2h0KTpccyoyNHB4fGZsZXg6XHMqMCAwIDI0cHgvKTsKICBhc3NlcnQubWF0Y2goZm9ybWFsLCAvXC5tYXRyaXgtZXhwbG9yZS1zY3JlZW4gXC5zZXR0aW5nLWdyaWQgbGFiZWwgPiBzcGFuIFwuc2V0dGluZy1sYWJlbC1pY29uLFtzXFNdKj93aWR0aDpccyozMnB4O1tefV0qaGVpZ2h0OlxzKjMycHg7L3MpOwp9KTsKCnRlc3QoIk1hdHJpeCBFeHBsb3JlIGRhdGUgbGFiZWxzIGFuZCBkaXNjbGFpbWVyIGZvbGxvdyB0aGUgdXBsb2FkZWQgd29yZGluZyBydWxlcyIsICgpID0+IHsKICBhc3NlcnQubWF0Y2goZmVhdHVyZVBhZ2VzLCAvdXNlU3RhdGVcKCLmnKzml6XvvIjmnIDmlrDvvIkiXCkvKTsKICBhc3NlcnQubWF0Y2goZmVhdHVyZVBhZ2VzLCAvXFsi5pys5pel77yI5pyA5paw77yJIiwgIuaYqOaXpO+8iOS4ijHmnJ/vvIkiLCAi5YmN5pel77yI5LiKMuaXn++8iSJcXS8pOwogIGFzc2VydC5kb2VzTm90TWF0Y2goZmVhdHVyZVBhZ2VzLCAv5pys5pelXChmnIDmlrBcKXzmmKjml6VcKOS4ijHmnJ9cKXzliY3ml6VcKOS4ijLmnJ9cKS8pOwogIGFzc2VydC5tYXRjaChmZWF0dXJlUGFnZXMsIC/kuI3kv53orYnkuK3njY7miJY8c3BhbiBjbGFzc05hbWU9ImV4cGxvcmUtZGlzY2xhaW1lci1ub3dyYXAiPueNsuWIqTwvc3Bhbj7jgIIvKTsKICBhc3NlcnQubWF0Y2goZm9ybWFsLCAvXC5tYXRyaXgtZXhwbG9yZS1zY3JlZW4gXC5leHBsb3JlLXJlc3VsdC1kaXNjbGFpbWVyIFwuZXhwbG9yZS1kaXNjbGFpbWVyLW5vd3JhcFxzKlx7W159XSp3aGl0ZS1zcGFjZTpccypub3dyYXA7L3MpOwp9KTsKCnRlc3QoIk1hdHJpeCBFeHBsb3JlIGZvcm1hbCByZXN1bHQgcnVsZXMgcmV0YWluIHRoZSBlZmZlY3RpdmUgdmlzdWFsIHZhbHVlcyBhZnRlciBkZWR1cGUiLCAoKSA9PiB7CiAgYXNzZXJ0Lm1hdGNoKGZvcm1hbCwgL1wubWF0cml4LWV4cGxvcmUtc2NyZWVuIFwucmVzdWx0LXN1bW1hcnkgc21hbGxccypce1tefV0qY29sb3I6XHMqI2FhYTM5YTsvc2cpOwogIGFzc2VydC5tYXRjaChmb3JtYWwsIC9cLm1hdHJpeC1leHBsb3JlLXNjcmVlbiBcLmNvbnNlY3V0aXZlLWZpbHRlci1idXR0b25ccypce1tefV0qYm9yZGVyOlxzKjFweCBzb2xpZCAjYWE3YjFjO1tefV0qYmFja2dyb3VuZDpccypyZ2JhXCgxMjgsXHMqODcsXHMqMTMsXHMqXC4xOFwpO1tefV0qY29sb3I6XHMqI2VhZDI5NTsvc2cpOwp9KTsK').decode()

def add_tests():
    path = Path("tests/matrix-explore-option-layout.test.mjs")
    source = path.read_text()
    needle = 'const formal = css.slice(formalStartIndex, formalEndIndex);\n'
    replacement = needle + 'const preFormal = css.slice(0, formalStartIndex);\nconst postFormal = css.slice(formalEndIndex);\nconst featurePages = readFileSync("src/FeaturePages.tsx", "utf8");\n'
    assert source.count(needle) == 1
    assert "// Matrix Explore document re-audit checks" not in source
    source = source.replace(needle, replacement, 1) + "\n" + TEST_APPEND
    path.write_text(source)

def patch():
    css_path = Path("src/feature-pages.css")
    css = css_path.read_text()
    marker = "/* Matrix Explore formal layout rules */"
    assert css.count(marker) == 1
    pre, formal_and_after = css.split(marker, 1)

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
    css = pre + marker + formal_and_after

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

if sys.argv[1] == "add-tests":
    add_tests()
elif sys.argv[1] == "patch":
    patch()
else:
    raise SystemExit("unknown mode")
