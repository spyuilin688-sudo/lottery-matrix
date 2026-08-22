from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file = Path(path)
    text = file.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected one {old!r}, got {count}")
    file.write_text(text.replace(old, new, 1))


# position: fixed uses viewport coordinates directly: header bottom + 8px.
replace_once("src/__tests__/DrawHistorySettings.test.tsx", "expect(dialog.style.top).toBe('208px');", "expect(dialog.style.top).toBe('128px');")
replace_once("src/__tests__/MatrixExplorePage.test.tsx", "expect(dialog.style.top).toBe('208px');", "expect(dialog.style.top).toBe('128px');")
replace_once("src/__tests__/NumberReferencePage.test.tsx", "expect(dialog.style.top).toBe('208px');", "expect(dialog.style.top).toBe('131px');")
