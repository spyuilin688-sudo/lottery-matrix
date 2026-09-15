from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def replace_once(path: str, old: str, new: str) -> None:
    target = ROOT / path
    text = target.read_text(encoding="utf-8")
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{path}: expected exactly one match, found {count}: {old[:80]!r}")
    target.write_text(text.replace(old, new, 1), encoding="utf-8")


def replace_all_checked(path: str, old: str, new: str, expected: int) -> None:
    target = ROOT / path
    text = target.read_text(encoding="utf-8")
    count = text.count(old)
    if count != expected:
        raise RuntimeError(f"{path}: expected {expected} matches, found {count}: {old[:80]!r}")
    target.write_text(text.replace(old, new), encoding="utf-8")


# ProfilePage owns authentication UI. Keep provider-specific LINE lifecycle logic intact.
replace_once(
    "src/features/MemberPages.tsx",
    'import { reconcilePendingLineLogoutPresence, signInWithLine, signOutFromMatrix } from "../auth/line-auth";\n',
    'import { reconcilePendingLineLogoutPresence, signInWithLine, signOutFromMatrix } from "../auth/line-auth";\nimport { signInWithGoogle } from "../auth/google-auth";\n',
)
replace_once(
    "src/features/MemberPages.tsx",
    '  const lineLoginInProgress = useRef(false);\n',
    '  const lineLoginInProgress = useRef(false);\n  const [signingInProvider, setSigningInProvider] = useState<"line" | "google" | null>(null);\n',
)
replace_once(
    "src/features/MemberPages.tsx",
    '      setAuthRetrying(false);\n      setAuthState(session ? "authenticated" : "anonymous");\n',
    '      setAuthRetrying(false);\n      setSigningInProvider(null);\n      setAuthState(session ? "authenticated" : "anonymous");\n',
)
replace_once(
    "src/features/MemberPages.tsx",
    '      } else {\n        setAuthState("signing-in");\n        markLineLoginAttempt();\n',
    '      } else {\n        setSigningInProvider("line");\n        setAuthState("signing-in");\n        markLineLoginAttempt();\n',
)
replace_once(
    "src/features/MemberPages.tsx",
    '    } finally {\n      setAuthState((current) => current === "signing-in" ? "anonymous" : current);\n    }\n  };\n  const handleInstallAction = async () => {\n',
    '    } finally {\n      if (action === "login") setSigningInProvider(null);\n      setAuthState((current) => current === "signing-in" ? "anonymous" : current);\n    }\n  };\n  const handleGoogleAuthAction = async () => {\n    if (authRetrying || authState !== "anonymous") return;\n    setSigningInProvider("google");\n    setAuthState("signing-in");\n    try {\n      const result = await signInWithGoogle();\n      if (result.kind !== "oauth-url") throw new Error(result.reason);\n      window.location.assign(result.url);\n    } catch {\n      setSigningInProvider(null);\n      setAuthState("anonymous");\n      await alertDialog({\n        title: "登入失敗",\n        description: "Google 登入目前無法使用，請稍後再試。",\n        tone: "danger",\n      });\n    }\n  };\n  const handleInstallAction = async () => {\n',
)
replace_once(
    "src/features/MemberPages.tsx",
    '        <section className="panel membership-card profile-card">\n',
    '        <section className="panel membership-card profile-card" data-auth-layout={authState === "anonymous" || authState === "signing-in" ? "multiple" : "single"}>\n',
)
replace_once(
    "src/features/MemberPages.tsx",
    '              alt={lineAvatarUrl ? "LINE 頭貼" : "Matrix 預設頭貼"}\n',
    '              alt={lineAvatarUrl ? "會員頭貼" : "Matrix 預設頭貼"}\n',
)
replace_once(
    "src/features/MemberPages.tsx",
    '            >LINE 暱稱：{lineNickname ?? ""}</p>\n',
    '            >會員名稱：{lineNickname ?? ""}</p>\n',
)
replace_once(
    "src/features/MemberPages.tsx",
    '''          {authState !== "initializing" ? <button
            type="button"
            className="profile-logout"
            data-auth-state={authState}
            onClick={() => void handleAuthAction()}
            disabled={authRetrying || authState === "signing-in" || authState === "signing-out"}
            aria-busy={authRetrying || authState === "signing-in" || authState === "signing-out"}
          ><span>{
            authState === "authenticated" ? "登出"
              : authState === "signing-in" ? "登入中…"
                : authState === "signing-out" ? "登出中…"
                  : authState === "degraded" ? "重新檢查"
                    : "LINE 登入"
          }</span></button> : null}
''',
    '''          {authState !== "initializing" ? <div className="profile-auth-actions">
            {authState === "anonymous" || authState === "signing-in" ? <>
              <button
                type="button"
                className="profile-logout"
                data-auth-state={authState}
                data-login-provider="line"
                aria-label={signingInProvider === "line" ? "登入中…" : "LINE 登入"}
                onClick={() => void handleAuthAction()}
                disabled={authState === "signing-in"}
                aria-busy={signingInProvider === "line"}
              ><span>{signingInProvider === "line" ? "登入中…" : "LINE"}</span></button>
              <button
                type="button"
                className="profile-logout"
                data-auth-state={authState}
                data-login-provider="google"
                aria-label={signingInProvider === "google" ? "Google 登入中…" : "Google 登入"}
                onClick={() => void handleGoogleAuthAction()}
                disabled={authState === "signing-in"}
                aria-busy={signingInProvider === "google"}
              ><span>{signingInProvider === "google" ? "登入中…" : "Google"}</span></button>
            </> : <button
              type="button"
              className="profile-logout"
              data-auth-state={authState}
              onClick={() => void handleAuthAction()}
              disabled={authRetrying || authState === "signing-out"}
              aria-busy={authRetrying || authState === "signing-out"}
            ><span>{
              authState === "authenticated" ? "登出"
                : authState === "signing-out" ? "登出中…"
                  : "重新檢查"
            }</span></button>}
          </div> : null}
''',
)

# Login-related legal/service copy must match the newly supported providers.
replace_once(
    "src/features/MemberPages.tsx",
    '<p>使用者透過 LINE 登入後，可查看會員資訊、訂閱資訊及目前帳號可使用的功能。</p>',
    '<p>使用者透過 LINE 或 Google 登入後，可查看會員資訊、訂閱資訊及目前帳號可使用的功能。</p>',
)
replace_once(
    "src/features/MemberPages.tsx",
    '["二、會員登入", <p>使用者透過 LINE 登入後使用會員功能。</p>],',
    '["二、會員登入", <p>使用者透過 LINE 或 Google 登入後使用會員功能。</p>],',
)
replace_once(
    "src/features/MemberPages.tsx",
    '"登入 LINE 所提供的帳號識別資料"',
    '"登入服務所提供的帳號識別資料"',
)
replace_once(
    "src/features/MemberPages.tsx",
    '<LegalInfoSection title="三、第三方服務"><p>目前已確認使用 LINE 登入。</p></LegalInfoSection>',
    '<LegalInfoSection title="三、第三方服務"><p>目前使用 LINE 與 Google 登入服務。</p></LegalInfoSection>',
)
replace_once(
    "src/features/MemberPages.tsx",
    '<LegalInfoSection title="六、第三方服務"><p>本服務使用 LINE 登入、金流服務或其他第三方服務。</p>',
    '<LegalInfoSection title="六、第三方服務"><p>本服務使用 LINE、Google 登入、金流服務或其他第三方服務。</p>',
)

# Profile CSS has one canonical owner. Use variables instead of late overrides or offsets.
replace_once(
    "src/feature-pages.css",
    '''.profile-card {
  top: 0;
  height: var(--membership-profile-height);
}
''',
    '''.profile-card {
  --profile-auth-zone-right: 6.08cqw;
  --profile-auth-zone-width: 15.48cqw;
  --profile-auth-column-count: 1;
  top: 0;
  height: var(--membership-profile-height);
}

.profile-card[data-auth-layout="multiple"] {
  --profile-auth-zone-width: 34cqw;
  --profile-auth-column-count: 2;
}
''',
)
replace_once(
    "src/feature-pages.css",
    '''  /* Use the available width up to 4px before the auth button at 78.44cqw. */
  right: calc(21.56cqw + 4px);
''',
    '''  /* Reserve the current authentication zone plus a 4px text safety gap. */
  right: calc(var(--profile-auth-zone-right) + var(--profile-auth-zone-width) + 4px);
''',
)
replace_once(
    "src/feature-pages.css",
    '''.profile-logout {
  position: absolute;
  left: 78.44cqw;
  top: 10.68898cqw;
  transform: translateY(-50%);
  display: grid;
  box-sizing: border-box;
  width: 15.48cqw;
  min-width: 0;
  min-height: 44px;
  height: 12.3cqw;
  padding: 0;
  place-items: center;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: #f1c66b;
  font-size: 3.5cqw;
  line-height: 1;
  cursor: pointer;
}
''',
    '''.profile-auth-actions {
  position: absolute;
  right: var(--profile-auth-zone-right);
  top: 10.68898cqw;
  transform: translateY(-50%);
  display: grid;
  width: var(--profile-auth-zone-width);
  min-width: 0;
  min-height: 44px;
  grid-template-columns: repeat(var(--profile-auth-column-count), minmax(0, 1fr));
  align-items: center;
  gap: 1cqw;
}

.profile-logout {
  position: static;
  display: grid;
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  min-height: 44px;
  height: 12.3cqw;
  padding: 0;
  place-items: center;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: #f1c66b;
  font-size: 3.5cqw;
  line-height: 1;
  cursor: pointer;
}
''',
)

# Remove the DOM MutationObserver injector from the protected runtime entry.
replace_once(
    "src/main.tsx",
    "import { installGoogleLoginEntry } from './auth/google-auth-entry';\n",
    "",
)
replace_once(
    "src/main.tsx",
    "installGoogleLoginEntry();\n",
    "",
)
entry = ROOT / "src/auth/google-auth-entry.ts"
if not entry.exists():
    raise RuntimeError("src/auth/google-auth-entry.ts is already missing")
entry.unlink()

# Update focused profile tests and add a React-level Google failure-path assertion.
replace_once(
    "src/__tests__/MemberProfilePage.test.tsx",
    '''const lineAuth = vi.hoisted(() => ({
  signInWithLine: vi.fn(),
  signOutFromMatrix: vi.fn(),
  reconcilePendingLineLogoutPresence: vi.fn(),
}));
''',
    '''const lineAuth = vi.hoisted(() => ({
  signInWithLine: vi.fn(),
  signOutFromMatrix: vi.fn(),
  reconcilePendingLineLogoutPresence: vi.fn(),
}));
const googleAuth = vi.hoisted(() => ({ signInWithGoogle: vi.fn() }));
''',
)
replace_once(
    "src/__tests__/MemberProfilePage.test.tsx",
    '''vi.mock("../auth/line-auth", () => ({
  signInWithLine: lineAuth.signInWithLine,
  signOutFromMatrix: lineAuth.signOutFromMatrix,
  reconcilePendingLineLogoutPresence: lineAuth.reconcilePendingLineLogoutPresence,
}));
''',
    '''vi.mock("../auth/line-auth", () => ({
  signInWithLine: lineAuth.signInWithLine,
  signOutFromMatrix: lineAuth.signOutFromMatrix,
  reconcilePendingLineLogoutPresence: lineAuth.reconcilePendingLineLogoutPresence,
}));
vi.mock("../auth/google-auth", () => ({ signInWithGoogle: googleAuth.signInWithGoogle }));
''',
)
replace_once(
    "src/__tests__/MemberProfilePage.test.tsx",
    '  lineAuth.reconcilePendingLineLogoutPresence.mockReset();\n',
    '  lineAuth.reconcilePendingLineLogoutPresence.mockReset();\n  googleAuth.signInWithGoogle.mockReset().mockResolvedValue({ kind: "unavailable", reason: "not-configured" });\n',
)
replace_once(
    "src/__tests__/MemberProfilePage.test.tsx",
    '  it("LINE 暱稱為資訊文字，不呈現輸入框邊線", async () => {\n',
    '  it("會員名稱為資訊文字，不呈現輸入框邊線", async () => {\n',
)
replace_once(
    "src/__tests__/MemberProfilePage.test.tsx",
    '    const nickname = screen.getByText("LINE 暱稱：");\n',
    '    const nickname = screen.getByText("會員名稱：");\n',
)
replace_once(
    "src/__tests__/MemberProfilePage.test.tsx",
    '''  it("未登入時在既有會員卡顯示 LINE 登入並啟動登入流程", async () => {
''',
    '''  it("未登入時同時顯示 Google 登入，失敗使用共用危險提示", async () => {
    supabase.auth.getSession.mockResolvedValueOnce({ data: { session: null }, error: null });
    render(<ProfilePage onNavigate={vi.fn()} />);

    const googleLogin = await screen.findByRole("button", { name: "Google 登入" });
    expect(screen.getByRole("button", { name: "LINE 登入" })).toBeInTheDocument();
    fireEvent.click(googleLogin);

    await waitFor(() => expect(googleAuth.signInWithGoogle).toHaveBeenCalledTimes(1));
    expect(appDialog.alert).toHaveBeenCalledWith({
      title: "登入失敗",
      description: "Google 登入目前無法使用，請稍後再試。",
      tone: "danger",
    });
    expect(screen.getByRole("button", { name: "Google 登入" })).toBeEnabled();
  });

  it("未登入時在既有會員卡顯示 LINE 登入並啟動登入流程", async () => {
''',
)

print("React-owned Google login refactor applied.")
