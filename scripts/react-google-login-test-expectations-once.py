from pathlib import Path

path = Path(__file__).resolve().parents[1] / "src/__tests__/MemberProfilePage.test.tsx"
text = path.read_text(encoding="utf-8")

replacements = [
    ('screen.getByRole("img", { name: "LINE 頭貼" })', 'screen.getByRole("img", { name: "會員頭貼" })', 1),
    ('it("LINE 有頭貼時顯示 LINE 頭貼", async () => {', 'it("會員登入有頭貼時顯示會員頭貼", async () => {', 1),
    ('screen.findByRole("img", { name: "LINE 頭貼" })', 'screen.findByRole("img", { name: "會員頭貼" })', 1),
    ('it("顯示 LINE 暱稱，長暱稱在固定框內縮小並省略", async () => {', 'it("顯示會員名稱，長名稱在固定框內縮小並省略", async () => {', 1),
    ('screen.findByText(`LINE 暱稱：${nickname}`)', 'screen.findByText(`會員名稱：${nickname}`)', 1),
    ('screen.getByText("LINE 暱稱：")', 'screen.getByText("會員名稱：")', 2),
]

for old, new, expected in replacements:
    count = text.count(old)
    if count != expected:
        raise RuntimeError(f"expected {expected} matches, found {count}: {old!r}")
    text = text.replace(old, new)

path.write_text(text, encoding="utf-8")
print("Provider-neutral profile test expectations applied.")
