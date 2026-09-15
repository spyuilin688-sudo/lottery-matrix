from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
path = ROOT / "src/__tests__/MemberProfilePage.test.tsx"
text = path.read_text(encoding="utf-8")
needle = '''  it("Google 登入啟動後維持登入中，交由 Supabase OAuth 接手導向", async () => {\n'''
insert = '''  it("未登入時 LINE 與 Google 登入按鈕垂直排列", async () => {\n    supabase.auth.getSession.mockResolvedValueOnce({ data: { session: null }, error: null });\n    render(<ProfilePage onNavigate={vi.fn()} />);\n\n    await screen.findByRole("button", { name: "Google 登入" });\n    const card = document.querySelector<HTMLElement>('.profile-card[data-auth-layout="multiple"]');\n    const actions = card?.querySelector<HTMLElement>(".profile-auth-actions");\n    expect(card).not.toBeNull();\n    expect(actions).not.toBeNull();\n    expect(Array.from(actions!.querySelectorAll<HTMLElement>("[data-login-provider]")).map((button) => button.dataset.loginProvider)).toEqual(["line", "google"]);\n    const cardStyle = getComputedStyle(card!);\n    expect(cardStyle.getPropertyValue("--profile-auth-column-count").trim()).toBe("1");\n    expect(cardStyle.getPropertyValue("--profile-auth-zone-width").trim()).toBe("15.48cqw");\n    expect(cardStyle.getPropertyValue("--profile-auth-button-min-height").trim()).toBe("32px");\n  });\n\n'''
if text.count(needle) != 1:
    raise RuntimeError("expected one Google login test anchor")
if "未登入時 LINE 與 Google 登入按鈕垂直排列" in text:
    raise RuntimeError("vertical auth regression already exists")
path.write_text(text.replace(needle, insert + needle, 1), encoding="utf-8")
print("Added vertical auth regression test.")
