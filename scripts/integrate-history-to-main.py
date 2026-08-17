from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected 1 match, got {count}")
    return text.replace(old, new, 1)


def sub_once(text: str, pattern: str, replacement: str, label: str, flags: int = 0) -> str:
    updated, count = re.subn(pattern, replacement, text, count=1, flags=flags)
    if count != 1:
        raise RuntimeError(f"{label}: expected 1 match, got {count}")
    return updated


def update_feature_pages() -> None:
    path = ROOT / "src/FeaturePages.tsx"
    text = path.read_text(encoding="utf-8")

    text = sub_once(
        text,
        r'\n\s*<div className="history-title-lottery native-select">.*?<span className="history-title-chevron" aria-hidden="true"><ChevronDownIcon /></span>\n\s*</div>',
        "",
        "remove history title lottery selector",
        re.S,
    )

    anchor = '''                <div className="history-filter-fields">\n                  <label>'''
    replacement = '''                <div className="history-filter-fields">\n                  <div className="history-filter-row">\n                    <span className="history-filter-icon"><img src="/assets/lottery/functions/彩種.png" alt="彩種" /></span>\n                    <div className="select-box native-select">\n                      <select aria-label="彩種" value={lottery} onChange={(event) => setLottery(event.target.value as LotteryId)}>\n                        {LOTTERIES.map((item) => <option value={item} key={item}>{item}</option>)}\n                      </select>\n                      <ChevronDownIcon />\n                    </div>\n                  </div>\n                  <label>'''
    text = replace_once(text, anchor, replacement, "insert lottery as first history filter")

    if "history-title-lottery" in text or "history-title-chevron" in text:
        raise RuntimeError("obsolete history title lottery markup remains")

    path.write_text(text, encoding="utf-8")


def update_feature_css() -> None:
    path = ROOT / "src/feature-pages.css"
    text = path.read_text(encoding="utf-8")

    obsolete_rules = [
        '.matrix-title-banner-actions .history-title-lottery { width: 84px; height: 26px; flex-basis: 84px; }\n',
        '.history-title-lottery { display: grid; width: 92px; height: 26px; flex: 0 0 92px; grid-template-columns: minmax(0, 1fr) 18px; }\n',
        '.history-title-lottery select { position: relative; z-index: 1; width: 100%; height: 100%; padding: 0 20px 0 5px; grid-row: 1; grid-column: 1 / -1; appearance: none; border: 0; outline: 0; background: transparent; color: var(--select-tech-text); font-size: 8px; }\n',
        '.history-title-lottery option { font-size: 8px; }\n',
        '.history-title-chevron { position: relative; z-index: 2; display: grid; grid-row: 1; grid-column: 2; place-items: center; color: var(--select-tech-accent); pointer-events: none; }\n',
        '.history-title-chevron svg { display: block; width: 12px; height: 12px; stroke-width: 2.5; }\n',
    ]
    for rule in obsolete_rules:
        text = replace_once(text, rule, "", "remove obsolete history title CSS")

    grouped = [
        ('.select-box,\n.history-title-lottery {', '.select-box {'),
        ('.select-box::before,\n.history-title-lottery::before,\n.select-box::after,\n.history-title-lottery::after {', '.select-box::before,\n.select-box::after {'),
        ('.select-box::before,\n.history-title-lottery::before {', '.select-box::before {'),
        ('.select-box::after,\n.history-title-lottery::after {', '.select-box::after {'),
        ('.select-box:focus-within::before,\n.history-title-lottery:focus-within::before {', '.select-box:focus-within::before {'),
    ]
    for old, new in grouped:
        text = replace_once(text, old, new, "remove obsolete selector from shared select CSS")

    text = sub_once(
        text,
        r'\n\.draw-history-screen \.history-title-lottery\.native-select select \{[^}]*\}',
        "",
        "remove history-screen title lottery select CSS",
        re.S,
    )

    if "history-title-lottery" in text or "history-title-chevron" in text:
        raise RuntimeError("obsolete history title lottery CSS remains")

    path.write_text(text, encoding="utf-8")


if __name__ == "__main__":
    update_feature_pages()
    update_feature_css()
