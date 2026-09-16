from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def replace_exact(relative: str, old: str, new: str, expected: int = 1) -> None:
    path = ROOT / relative
    text = path.read_text(encoding="utf-8")
    count = text.count(old)
    if count != expected:
        raise SystemExit(f"{relative}: expected {expected} occurrence(s), found {count}: {old[:100]!r}")
    path.write_text(text.replace(old, new), encoding="utf-8")


# PWA member profile contract: use the stable Matrix member row ID.
replace_exact(
    "src/member-api.ts",
    "export type MemberProfileResponse = {\n  lineUserId: string | null;",
    "export type MemberProfileResponse = {\n  memberId: string;\n  lineUserId: string | null;",
)

replace_exact(
    "src/features/MemberPages.tsx",
    '''          <div className="profile-copy">\n            <h2>樂彩玩家</h2>\n            <p\n              className="profile-nickname"\n              data-name-fit={lineNickname && Array.from(lineNickname).length > 12 ? "compact" : "regular"}\n            >會員名稱：{lineNickname ?? ""}</p>\n          </div>''',
    '''          <div className="profile-copy">\n            <h2>樂彩玩家</h2>\n            <p\n              className="profile-nickname"\n              data-name-fit={memberProfile?.memberId && Array.from(memberProfile.memberId).length > 12 ? "compact" : "regular"}\n            >會員ID：{memberProfile?.memberId ?? ""}</p>\n          </div>''',
)

# Existing profile tests now assert the member ID instead of provider/nickname identity.
replace_exact(
    "src/__tests__/MemberProfilePage.test.tsx",
    '''  memberApi.fetchMemberProfile.mockReset().mockResolvedValue({\n    lineUserId: "line-real",''',
    '''  memberApi.fetchMemberProfile.mockReset().mockResolvedValue({\n    memberId: "11111111-1111-4111-8111-111111111111",\n    lineUserId: "line-real",''',
)
replace_exact(
    "src/__tests__/MemberProfilePage.test.tsx",
    '''  it("會員名稱為資訊文字，不呈現輸入框邊線", async () => {\n    render(<ProfilePage onNavigate={vi.fn()} />);\n    await screen.findByRole("button", { name: "登出" });\n    const nickname = screen.getByText("會員名稱：");\n    expect(getComputedStyle(nickname).borderTopWidth).toBe("0px");''',
    '''  it("會員ID為資訊文字，不呈現輸入框邊線", async () => {\n    render(<ProfilePage onNavigate={vi.fn()} />);\n    await screen.findByRole("button", { name: "登出" });\n    const memberId = await screen.findByText("會員ID：11111111-1111-4111-8111-111111111111");\n    expect(getComputedStyle(memberId).borderTopWidth).toBe("0px");''',
)
replace_exact(
    "src/__tests__/MemberProfilePage.test.tsx",
    '''  it("顯示會員名稱，長名稱在固定框內縮小並省略", async () => {\n    const nickname = "這是一個很長的 LINE 會員暱稱";''',
    '''  it("顯示會員ID，長ID在固定框內縮小並省略", async () => {\n    const nickname = "這是一個很長的 LINE 會員暱稱";''',
)
replace_exact(
    "src/__tests__/MemberProfilePage.test.tsx",
    '''    const nicknameFrame = await screen.findByText(`會員名稱：${nickname}`);\n    expect(screen.queryByText(/LINE ID：/)).not.toBeInTheDocument();\n    expect(nicknameFrame).toHaveAttribute("data-name-fit", "compact");\n    // Nickname text scales with the artwork container; jsdom preserves cqw units.\n    expect(getComputedStyle(nicknameFrame).fontSize).toBe("2.8cqw");\n    expect(getComputedStyle(nicknameFrame).overflow).toBe("hidden");\n    expect(getComputedStyle(nicknameFrame).textOverflow).toBe("ellipsis");\n    expect(getComputedStyle(nicknameFrame).whiteSpace).toBe("nowrap");''',
    '''    const memberIdFrame = await screen.findByText("會員ID：11111111-1111-4111-8111-111111111111");\n    expect(screen.queryByText(/LINE ID：/)).not.toBeInTheDocument();\n    expect(screen.queryByText(/會員名稱：/)).not.toBeInTheDocument();\n    expect(memberIdFrame).toHaveAttribute("data-name-fit", "compact");\n    // Member ID text scales with the existing artwork container; jsdom preserves cqw units.\n    expect(getComputedStyle(memberIdFrame).fontSize).toBe("2.8cqw");\n    expect(getComputedStyle(memberIdFrame).overflow).toBe("hidden");\n    expect(getComputedStyle(memberIdFrame).textOverflow).toBe("ellipsis");\n    expect(getComputedStyle(memberIdFrame).whiteSpace).toBe("nowrap");''',
)
replace_exact(
    "src/__tests__/MemberProfilePage.test.tsx",
    '''  it("以登入會員 API 資料取代固定 LINE ID、方案與到期日", async () => {''',
    '''  it("以登入會員 API 資料顯示會員ID、方案與到期日", async () => {''',
)
replace_exact(
    "src/__tests__/MemberProfilePage.test.tsx",
    '''    expect(screen.getByText("會員名稱：")).toBeInTheDocument();\n    expect(screen.getByText("年費方案")).toBeInTheDocument();''',
    '''    expect(screen.getByText("會員ID：11111111-1111-4111-8111-111111111111")).toBeInTheDocument();\n    expect(screen.getByText("年費方案")).toBeInTheDocument();''',
)
replace_exact(
    "src/__tests__/MemberProfilePage.test.tsx",
    '''    memberApi.fetchMemberProfile.mockResolvedValueOnce({\n      lineUserId: "line-free",''',
    '''    memberApi.fetchMemberProfile.mockResolvedValueOnce({\n      memberId: "member-free",\n      lineUserId: "line-free",''',
)
replace_exact(
    "src/__tests__/MemberProfilePage.test.tsx",
    '''    memberApi.fetchMemberProfile.mockResolvedValueOnce({\n      lineUserId: "line-lifetime",''',
    '''    memberApi.fetchMemberProfile.mockResolvedValueOnce({\n      memberId: "member-lifetime",\n      lineUserId: "line-lifetime",''',
)
replace_exact(
    "src/__tests__/MemberProfilePage.test.tsx",
    '''    await waitFor(() => expect(screen.getByText("會員名稱：")).toBeInTheDocument());''',
    '''    await waitFor(() => expect(screen.getByText("會員ID：member-lifetime")).toBeInTheDocument());''',
)
replace_exact(
    "src/__tests__/MemberProfilePage.test.tsx",
    '''    memberApi.fetchMemberProfile.mockResolvedValueOnce({\n      lineUserId: "line-taipei",''',
    '''    memberApi.fetchMemberProfile.mockResolvedValueOnce({\n      memberId: "member-taipei",\n      lineUserId: "line-taipei",''',
)

# Admin backend: keep provider metadata available internally, but make members.id the stable displayed identity.
replace_exact(
    "apps/admin/backend/admin-data.ts",
    '''      id: String(row.id),\n      authUserId: row.auth_user_id,''',
    '''      id: String(row.id),\n      memberId: String(row.id),\n      authUserId: row.auth_user_id,''',
    expected=2,
)
replace_exact(
    "apps/admin/backend/admin-data.ts",
    "  id: 'id', lineDisplayName: 'line_display_name', registeredAt: 'registered_at', status: 'status',",
    "  id: 'id', memberId: 'id', lineDisplayName: 'line_display_name', registeredAt: 'registered_at', status: 'status',",
)
replace_exact(
    "apps/admin/backend/admin-data.ts",
    "redeemed_member:members!activation_codes_redeemed_by_member_id_fkey(line_display_name)",
    "redeemed_member:members!activation_codes_redeemed_by_member_id_fkey(id,line_display_name)",
)
replace_exact(
    "apps/admin/backend/admin-data.ts",
    '''      redeemedByLineDisplayName: (row.redeemed_member as Row | null)?.line_display_name ?? null,''',
    '''      redeemedByMemberId: (row.redeemed_member as Row | null)?.id ?? null,\n      redeemedByLineDisplayName: (row.redeemed_member as Row | null)?.line_display_name ?? null,''',
)
replace_exact(
    "apps/admin/backend/admin-data.ts",
    "redeemedByLineDisplayName: 'redeemed_member(line_display_name)'",
    "redeemedByMemberId: 'redeemed_member(id)', redeemedByLineDisplayName: 'redeemed_member(line_display_name)'",
)

# Admin UI: use member ID as the primary identity in users, subscriptions, transfers and activation-code views.
replace_exact(
    "apps/admin/src/AdminApp.tsx",
    '''  users: [\n    "authUserId",\n    "lineDisplayName",''',
    '''  users: [\n    "memberId",''',
)
replace_exact(
    "apps/admin/src/AdminApp.tsx",
    '''  subscriptions: [\n    "authUserId",''',
    '''  subscriptions: [\n    "memberId",''',
)
replace_exact(
    "apps/admin/src/AdminApp.tsx",
    '''    "redeemedByLineDisplayName",''',
    '''    "redeemedByMemberId",''',
)
replace_exact(
    "apps/admin/src/AdminApp.tsx",
    '''  memberId: "會員 ID",''',
    '''  memberId: "會員ID",''',
)
replace_exact(
    "apps/admin/src/AdminApp.tsx",
    '''  redeemedByLineDisplayName: "兌換會員",''',
    '''  redeemedByMemberId: "兌換會員ID",''',
)
replace_exact(
    "apps/admin/src/AdminApp.tsx",
    '''const redeemedActivationCode = (row: Row) => row.status === "used" || Boolean(row.redeemedAt || row.redeemedByLineDisplayName);''',
    '''const redeemedActivationCode = (row: Row) => row.status === "used" || Boolean(row.redeemedAt || row.redeemedByMemberId);''',
)
replace_exact(
    "apps/admin/src/AdminApp.tsx",
    '''  const fields = ["lineDisplayName", "registeredAt", "lastOnlineAt", "recentOnlineMinutes", "status", "recentIp", "estimatedRegion"];''',
    '''  const fields = ["memberId", "registeredAt", "lastOnlineAt", "recentOnlineMinutes", "status", "recentIp", "estimatedRegion"];''',
)
replace_exact(
    "apps/admin/src/AdminApp.tsx",
    '''sorts={[["registeredAt", "註冊時間"], ["lastOnlineAt", "最後上線時間"], ["lineDisplayName", "LINE 名稱"]]}''',
    '''sorts={[["registeredAt", "註冊時間"], ["lastOnlineAt", "最後上線時間"], ["memberId", "會員ID"]]}''',
)
replace_exact(
    "apps/admin/src/AdminApp.tsx",
    '''sorts={[["planStartedAt", "開始時間"], ["planExpiresAt", "到期時間"], ["lineDisplayName", "LINE 名稱"]]}''',
    '''sorts={[["planStartedAt", "開始時間"], ["planExpiresAt", "到期時間"], ["memberId", "會員ID"]]}''',
)
replace_exact(
    "apps/admin/src/AdminApp.tsx",
    '''<thead><tr><th>LINE名稱</th><th>訂閱方案</th>''',
    '''<thead><tr><th>會員ID</th><th>訂閱方案</th>''',
)
replace_exact(
    "apps/admin/src/AdminApp.tsx",
    '''<td>{text(row.lineDisplayName)}</td><td>{text(row.planName)}</td>''',
    '''<td>{text(row.memberId)}</td><td>{text(row.planName)}</td>''',
)
replace_exact(
    "apps/admin/src/AdminApp.tsx",
    '''            <p>{text(editing.authUserId)}</p>''',
    '''            <p>{text(editing.memberId)}</p>''',
)
replace_exact(
    "apps/admin/src/AdminApp.tsx",
    '''            <div><b>{text(row.lineDisplayName)}</b><span>''',
    '''            <div><b>{text(row.memberId)}</b><span>''',
)

replace_exact(
    "apps/admin/src/UserInfoDialog.tsx",
    '''  const fields = [\n    ['LINE名稱', value(row.lineDisplayName)],\n    ['註冊時間', formatAdminDateTime(row.registeredAt)],\n    ['最後上線時間', formatAdminDateTime(row.lastOnlineAt)],\n    ['驗證用戶ID', value(row.authUserId)],\n  ];''',
    '''  const fields = [\n    ['會員ID', value(row.memberId ?? row.id)],\n    ['註冊時間', formatAdminDateTime(row.registeredAt)],\n    ['最後上線時間', formatAdminDateTime(row.lastOnlineAt)],\n  ];''',
)

replace_exact(
    "apps/admin/src/UserInfoDialog.test.tsx",
    "it('shows four profile fields and loads five login records per page', async () => {",
    "it('shows provider-neutral member fields and loads five login records per page', async () => {",
)
replace_exact(
    "apps/admin/src/UserInfoDialog.test.tsx",
    '''  expect(host.querySelectorAll('dl > div')).toHaveLength(4);''',
    '''  expect(host.querySelectorAll('dl > div')).toHaveLength(3);\n  expect(host.textContent).toContain('會員ID');\n  expect(host.textContent).toContain('member-1');\n  expect(host.textContent).not.toContain('驗證用戶ID');''',
)

replace_exact(
    "apps/admin/backend/admin-data.test.ts",
    '''        id: 'm1',\n        authUserId: 'u1',''',
    '''        id: 'm1',\n        memberId: 'm1',\n        authUserId: 'u1',''',
)
replace_exact(
    "apps/admin/backend/admin-data.test.ts",
    '''  it('maps the activation-code redeemer LINE nickname without exposing the member ID', async () => {''',
    '''  it('maps the activation-code redeemer member ID for provider-neutral administration', async () => {''',
)
replace_exact(
    "apps/admin/backend/admin-data.test.ts",
    '''      redeemed_member: { line_display_name: '兌換者暱稱' },''',
    '''      redeemed_member: { id: 'member-1', line_display_name: '兌換者暱稱' },''',
)
replace_exact(
    "apps/admin/backend/admin-data.test.ts",
    '''    expect(result.items[0]).toMatchObject({ redeemedByLineDisplayName: '兌換者暱稱' });\n    expect(result.items[0]).not.toHaveProperty('redeemedByMemberId');\n    expect(api.request).toHaveBeenCalledWith(expect.stringContaining(\n      'redeemed_member:members!activation_codes_redeemed_by_member_id_fkey(line_display_name)',\n    ));''',
    '''    expect(result.items[0]).toMatchObject({ redeemedByMemberId: 'member-1', redeemedByLineDisplayName: '兌換者暱稱' });\n    expect(api.request).toHaveBeenCalledWith(expect.stringContaining(\n      'redeemed_member:members!activation_codes_redeemed_by_member_id_fkey(id,line_display_name)',\n    ));''',
)

migration = ROOT / "supabase/migrations/20260916103000_member_profile_member_id.sql"
if migration.exists():
    raise SystemExit(f"{migration}: already exists")
migration.write_text('''create or replace function public.member_profile_20260829_impl()\nreturns jsonb\nlanguage plpgsql\nstable\nsecurity definer\nset search_path = ''\nas $$\ndeclare\n  v_member_id uuid := private.active_member_id();\n  v_result jsonb;\nbegin\n  select pg_catalog.jsonb_build_object(\n    'memberId', member.id,\n    'lineUserId', member.line_user_id,\n    'planName', case\n      when member.is_lifetime then '終身方案'\n      else pg_catalog.coalesce(plan.name, '免費會員')\n    end,\n    'planExpiresAt', member.plan_expires_at,\n    'isLifetime', member.is_lifetime\n  ) into v_result\n  from public.members as member\n  left join public.plans as plan on plan.id = member.current_plan_id\n  where member.id = v_member_id\n  limit 1;\n\n  if v_result is null then\n    raise exception using errcode = '42501', message = 'FORBIDDEN';\n  end if;\n  return v_result;\nend;\n$$;\n\nrevoke all on function public.member_profile_20260829_impl() from public, anon, authenticated;\n''', encoding="utf-8")
