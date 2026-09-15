from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def replace_once(path: str, old: str, new: str) -> None:
    target = ROOT / path
    text = target.read_text(encoding="utf-8")
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{path}: expected exactly one match, found {count}: {old[:120]!r}")
    target.write_text(text.replace(old, new, 1), encoding="utf-8")


replace_once(
    "src/features/MemberPages.tsx",
    '''    try {\n      const result = await signInWithGoogle();\n      if (result.kind !== "oauth-url") throw new Error(result.reason);\n      window.location.assign(result.url);\n    } catch {\n''',
    '''    try {\n      // Supabase signInWithOAuth owns the browser redirect. Keep the UI in the\n      // signing-in state until navigation unloads this page or the auth callback\n      // restores a session.\n      await signInWithGoogle();\n    } catch {\n''',
)

replace_once(
    "src/__tests__/MemberProfilePage.test.tsx",
    '  googleAuth.signInWithGoogle.mockReset().mockResolvedValue({ kind: "unavailable", reason: "not-configured" });\n',
    '  googleAuth.signInWithGoogle.mockReset().mockResolvedValue(undefined);\n',
)

replace_once(
    "src/__tests__/MemberProfilePage.test.tsx",
    '''  it("未登入時同時顯示 Google 登入，失敗使用共用危險提示", async () => {\n    supabase.auth.getSession.mockResolvedValueOnce({ data: { session: null }, error: null });\n    render(<ProfilePage onNavigate={vi.fn()} />);\n\n    const googleLogin = await screen.findByRole("button", { name: "Google 登入" });\n    expect(screen.getByRole("button", { name: "LINE 登入" })).toBeInTheDocument();\n    fireEvent.click(googleLogin);\n\n    await waitFor(() => expect(googleAuth.signInWithGoogle).toHaveBeenCalledTimes(1));\n    expect(appDialog.alert).toHaveBeenCalledWith({\n      title: "登入失敗",\n      description: "Google 登入目前無法使用，請稍後再試。",\n      tone: "danger",\n    });\n    expect(screen.getByRole("button", { name: "Google 登入" })).toBeEnabled();\n  });\n''',
    '''  it("Google 登入啟動後維持登入中，交由 Supabase OAuth 接手導向", async () => {\n    supabase.auth.getSession.mockResolvedValueOnce({ data: { session: null }, error: null });\n    render(<ProfilePage onNavigate={vi.fn()} />);\n\n    const googleLogin = await screen.findByRole("button", { name: "Google 登入" });\n    expect(screen.getByRole("button", { name: "LINE 登入" })).toBeInTheDocument();\n    fireEvent.click(googleLogin);\n\n    await waitFor(() => expect(googleAuth.signInWithGoogle).toHaveBeenCalledTimes(1));\n    expect(screen.getByRole("button", { name: "Google 登入中…" })).toBeDisabled();\n    expect(appDialog.alert).not.toHaveBeenCalledWith(expect.objectContaining({ title: "登入失敗" }));\n  });\n\n  it("Google OAuth 啟動失敗時恢復登入按鈕並使用共用危險提示", async () => {\n    supabase.auth.getSession.mockResolvedValueOnce({ data: { session: null }, error: null });\n    googleAuth.signInWithGoogle.mockRejectedValueOnce(new Error("GOOGLE_OAUTH_FAILED"));\n    render(<ProfilePage onNavigate={vi.fn()} />);\n\n    fireEvent.click(await screen.findByRole("button", { name: "Google 登入" }));\n\n    await waitFor(() => expect(appDialog.alert).toHaveBeenCalledWith({\n      title: "登入失敗",\n      description: "Google 登入目前無法使用，請稍後再試。",\n      tone: "danger",\n    }));\n    expect(screen.getByRole("button", { name: "Google 登入" })).toBeEnabled();\n  });\n''',
)

print("Applied Google profile build contract fix.")
