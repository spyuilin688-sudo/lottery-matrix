from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def replace_exact(relative: str, old: str, new: str, expected: int = 1) -> None:
    path = ROOT / relative
    text = path.read_text(encoding='utf-8')
    count = text.count(old)
    if count != expected:
        raise SystemExit(f'{relative}: expected {expected} occurrence(s), found {count}: {old[:120]!r}')
    path.write_text(text.replace(old, new), encoding='utf-8')


def insert_after(relative: str, anchor: str, addition: str) -> None:
    replace_exact(relative, anchor, anchor + addition)


# PWA: provider-specific ID only, preserving the existing profile geometry.
insert_after(
    'src/features/MemberPages.tsx',
    'import { signInWithGoogle } from "../auth/google-auth";\n',
    'import { providerIdentityFromSession, type ProviderIdentity } from "../auth/provider-identity";\n',
)
replace_exact(
    'src/features/MemberPages.tsx',
    '  const [lineNickname, setLineNickname] = useState<string | null>(null);\n',
    '  const [providerIdentity, setProviderIdentity] = useState<ProviderIdentity | null>(null);\n',
)
replace_exact(
    'src/features/MemberPages.tsx',
    '      setLineNickname(lineNicknameFromSession(session));\n',
    '      setProviderIdentity(providerIdentityFromSession(session));\n',
)
replace_exact(
    'src/features/MemberPages.tsx',
    '        setLineNickname(null);\n',
    '        setProviderIdentity(null);\n',
)
replace_exact(
    'src/features/MemberPages.tsx',
    '            setLineNickname(lineNicknameFromSession(data.session));\n',
    '            setProviderIdentity(providerIdentityFromSession(data.session));\n',
)
replace_exact(
    'src/features/MemberPages.tsx',
    '  const displayedPlanDescription = displayedPlanName === "免費會員" ? "核心功能體驗" : "享有所有 Matrix Pro 功能";\n',
    '  const displayedPlanDescription = displayedPlanName === "免費會員" ? "核心功能體驗" : "享有所有 Matrix Pro 功能";\n'
    '  const visibleProviderIdentity = providerIdentity ?? (memberProfile?.lineUserId\n'
    '    ? { label: "LINE ID" as const, value: memberProfile.lineUserId }\n'
    '    : null);\n',
)
replace_exact(
    'src/features/MemberPages.tsx',
    '''            <p\n              className="profile-nickname"\n              data-name-fit={memberProfile?.memberId && Array.from(memberProfile.memberId).length > 12 ? "compact" : "regular"}\n            >會員ID：{memberProfile?.memberId ?? ""}</p>''',
    '''            <p\n              className="profile-nickname"\n              data-name-fit={visibleProviderIdentity?.value && Array.from(visibleProviderIdentity.value).length > 12 ? "compact" : "regular"}\n            >{visibleProviderIdentity ? `${visibleProviderIdentity.label}：${visibleProviderIdentity.value}` : ""}</p>''',
)

# PWA tests: visible identity is LINE/Google provider ID, never internal member UUID.
replace_exact(
    'src/__tests__/MemberProfilePage.test.tsx',
    '  it("會員ID為資訊文字，不呈現輸入框邊線", async () => {',
    '  it("LINE ID為資訊文字，不呈現輸入框邊線", async () => {',
)
replace_exact(
    'src/__tests__/MemberProfilePage.test.tsx',
    '    const memberId = await screen.findByText("會員ID：11111111-1111-4111-8111-111111111111");\n    expect(getComputedStyle(memberId).borderTopWidth).toBe("0px");',
    '    const providerId = await screen.findByText("LINE ID：line-real");\n    expect(getComputedStyle(providerId).borderTopWidth).toBe("0px");',
)
replace_exact(
    'src/__tests__/MemberProfilePage.test.tsx',
    '''  it("顯示會員ID，長ID在固定框內縮小並省略", async () => {\n    const nickname = "這是一個很長的 LINE 會員暱稱";\n    supabase.auth.getSession.mockResolvedValueOnce({\n      data: {\n        session: {\n          access_token: "member-session",\n          user: { user_metadata: { name: nickname } },\n        },\n      },\n      error: null,\n    });\n\n    render(<ProfilePage onNavigate={vi.fn()} />);\n\n    const memberIdFrame = await screen.findByText("會員ID：11111111-1111-4111-8111-111111111111");\n    expect(screen.queryByText(/LINE ID：/)).not.toBeInTheDocument();\n    expect(screen.queryByText(/會員名稱：/)).not.toBeInTheDocument();\n    expect(memberIdFrame).toHaveAttribute("data-name-fit", "compact");\n    // Member ID text scales with the existing artwork container; jsdom preserves cqw units.\n    expect(getComputedStyle(memberIdFrame).fontSize).toBe("2.8cqw");\n    expect(getComputedStyle(memberIdFrame).overflow).toBe("hidden");\n    expect(getComputedStyle(memberIdFrame).textOverflow).toBe("ellipsis");\n    expect(getComputedStyle(memberIdFrame).whiteSpace).toBe("nowrap");\n  });''',
    '''  it("顯示 LINE ID，長ID在固定框內縮小並省略", async () => {\n    const nickname = "這是一個很長的 LINE 會員暱稱";\n    const lineId = "line-user-id-that-is-long-123456";\n    supabase.auth.getSession.mockResolvedValueOnce({\n      data: {\n        session: {\n          access_token: "member-session",\n          user: {\n            user_metadata: { name: nickname },\n            identities: [{ provider: "custom:line", provider_id: lineId }],\n          },\n        },\n      },\n      error: null,\n    });\n\n    render(<ProfilePage onNavigate={vi.fn()} />);\n\n    const providerIdFrame = await screen.findByText(`LINE ID：${lineId}`);\n    expect(screen.queryByText(/會員ID：/)).not.toBeInTheDocument();\n    expect(screen.queryByText(/會員名稱：/)).not.toBeInTheDocument();\n    expect(providerIdFrame).toHaveAttribute("data-name-fit", "compact");\n    expect(getComputedStyle(providerIdFrame).fontSize).toBe("2.8cqw");\n    expect(getComputedStyle(providerIdFrame).overflow).toBe("hidden");\n    expect(getComputedStyle(providerIdFrame).textOverflow).toBe("ellipsis");\n    expect(getComputedStyle(providerIdFrame).whiteSpace).toBe("nowrap");\n  });''',
)
replace_exact(
    'src/__tests__/MemberProfilePage.test.tsx',
    '  it("以登入會員 API 資料顯示會員ID、方案與到期日", async () => {',
    '  it("以登入會員 API 資料顯示登入供應商ID、方案與到期日", async () => {',
)
replace_exact(
    'src/__tests__/MemberProfilePage.test.tsx',
    '    expect(screen.getByText("會員ID：11111111-1111-4111-8111-111111111111")).toBeInTheDocument();',
    '    expect(screen.getByText("LINE ID：line-real")).toBeInTheDocument();',
)
replace_exact(
    'src/__tests__/MemberProfilePage.test.tsx',
    '    await waitFor(() => expect(screen.getByText("會員ID：member-lifetime")).toBeInTheDocument());',
    '    await waitFor(() => expect(screen.getByText("LINE ID：line-lifetime")).toBeInTheDocument());',
)

# Admin backend: keep internal IDs for operations only; enrich every visible member row with LINE/Google ID.
insert_after(
    'apps/admin/backend/admin-data.ts',
    "import { lookupLocations, memberConnectionSummaries } from './member-login-history';\n",
    "import { providerIdentityFromAuthUser, type AuthUserForIdentity } from './member-provider-identity';\n",
)
replace_exact('apps/admin/backend/admin-data.ts', 'select=id,auth_user_id,line_display_name,registered_at', 'select=id,auth_user_id,line_user_id,line_display_name,registered_at', expected=2)
replace_exact('apps/admin/backend/admin-data.ts', '      authUserId: row.auth_user_id,\n      lineDisplayName: row.line_display_name,', '      authUserId: row.auth_user_id,\n      lineUserId: row.line_user_id,\n      lineDisplayName: row.line_display_name,', expected=2)
replace_exact(
    'apps/admin/backend/admin-data.ts',
    'member:members(line_display_name)&order=paid_at.desc.nullslast,id.asc',
    'member:members(auth_user_id,line_user_id,line_display_name)&order=paid_at.desc.nullslast,id.asc',
)
replace_exact(
    'apps/admin/backend/admin-data.ts',
    '      memberId: row.member_id,\n      lineDisplayName: (row.member as Row | null)?.line_display_name ?? null,\n      planId: row.plan_id,',
    '      memberId: row.member_id,\n      authUserId: (row.member as Row | null)?.auth_user_id ?? null,\n      lineUserId: (row.member as Row | null)?.line_user_id ?? null,\n      lineDisplayName: (row.member as Row | null)?.line_display_name ?? null,\n      planId: row.plan_id,',
    expected=2,
)
replace_exact(
    'apps/admin/backend/admin-data.ts',
    'redeemed_member:members!activation_codes_redeemed_by_member_id_fkey(id,line_display_name)',
    'redeemed_member:members!activation_codes_redeemed_by_member_id_fkey(id,auth_user_id,line_user_id,line_display_name)',
)
replace_exact(
    'apps/admin/backend/admin-data.ts',
    '      redeemedByMemberId: (row.redeemed_member as Row | null)?.id ?? null,\n      redeemedByLineDisplayName: (row.redeemed_member as Row | null)?.line_display_name ?? null,',
    '      redeemedByMemberId: (row.redeemed_member as Row | null)?.id ?? null,\n      authUserId: (row.redeemed_member as Row | null)?.auth_user_id ?? null,\n      lineUserId: (row.redeemed_member as Row | null)?.line_user_id ?? null,\n      redeemedByLineDisplayName: (row.redeemed_member as Row | null)?.line_display_name ?? null,',
)
replace_exact(
    'apps/admin/backend/admin-data.ts',
    'member:members(line_display_name)&order=submitted_at.desc,id.asc',
    'member:members(auth_user_id,line_user_id,line_display_name)&order=submitted_at.desc,id.asc',
)
insert_after(
    'apps/admin/backend/admin-data.ts',
    '''async function enrichLoginRecords(items: Array<Row & { id: string }>, api: Requester) {\n  const ips = items.map(item => typeof item.ip === 'string' ? item.ip : null);\n  const locations = await lookupLocations(ips, api).catch(() => new Map<string, string | null>());\n  return items.map(item => ({ ...item, estimatedRegion: typeof item.ip === 'string' ? locations.get(item.ip) || null : null }));\n}\n''',
    '''\ntype AuthUsersResponse = { users?: AuthUserForIdentity[] };\n\nasync function listAllAuthUsers(api: Requester) {\n  const users: AuthUserForIdentity[] = [];\n  for (let page = 1; ; page += 1) {\n    const response = await api.request<AuthUsersResponse>(`/auth/v1/admin/users?page=${page}&per_page=${adminReadPageSize}`);\n    const current = Array.isArray(response?.users) ? response.users : [];\n    users.push(...current);\n    if (current.length < adminReadPageSize) return users;\n  }\n}\n\nasync function enrichProviderIdentities(items: Array<Row & { id: string }>, api: Requester) {\n  if (!items.length) return [];\n  const needsAuth = items.some((item) => !item.lineUserId && item.authUserId);\n  const authUsers = needsAuth ? await listAllAuthUsers(api) : [];\n  const byId = new Map(authUsers.map((user) => [String(user.id ?? ''), user]));\n  return items.map((item) => {\n    const identity = providerIdentityFromAuthUser(item.lineUserId, byId.get(String(item.authUserId ?? '')));\n    return {\n      ...item,\n      identityLabel: identity?.label ?? null,\n      identityValue: identity?.value ?? null,\n      identityDisplay: identity ? `${identity.label}：${identity.value}` : null,\n    };\n  });\n}\n''',
)
replace_exact(
    'apps/admin/backend/admin-data.ts',
    '''  if (table !== 'users' && table !== 'subscriptions') return { items };\n  return { items: await enrichMembers(items, api, currentDate) };''',
    '''  if (table === 'users' || table === 'subscriptions') return { items: await enrichMembers(items, api, currentDate) };\n  if (['subscriptionRecords', 'transferRequests', 'activationCodes'].includes(table)) {\n    return { items: await enrichProviderIdentities(items, api) };\n  }\n  return { items };''',
)
replace_exact(
    'apps/admin/backend/admin-data.ts',
    '''  const connections = await memberConnectionSummaries(items.map(item => String(item.authUserId ?? '')), api);''',
    '''  const providerItems = await enrichProviderIdentities(items, api);\n  const connections = await memberConnectionSummaries(items.map(item => String(item.authUserId ?? '')), api);''',
)
replace_exact(
    'apps/admin/backend/admin-data.ts',
    '''  return items.map((item) => ({ ...item, ...(connections.get(String(item.authUserId)) ?? { recentIp: null, estimatedRegion: null }), recentOnlineMinutes: Math.round((secondsByMember.get(String(item.id)) ?? 0) / 60) }));''',
    '''  return providerItems.map((item) => ({ ...item, ...(connections.get(String(item.authUserId)) ?? { recentIp: null, estimatedRegion: null }), recentOnlineMinutes: Math.round((secondsByMember.get(String(item.id)) ?? 0) / 60) }));''',
)
replace_exact(
    'apps/admin/backend/admin-data.ts',
    '''  const result = await readAdminPage(url, page, pageDefinitions[table].pageSize, api);\n  return { ...result, items: result.items.map(definition.map) };''',
    '''  const result = await readAdminPage(url, page, pageDefinitions[table].pageSize, api);\n  const items = result.items.map(definition.map);\n  if (['subscriptionRecords', 'transferRequests', 'activationCodes'].includes(table)) {\n    return { ...result, items: await enrichProviderIdentities(items, api) };\n  }\n  return { ...result, items };''',
)

# Admin UI: display provider-specific identity everywhere the member identity is surfaced.
replace_exact('apps/admin/src/AdminApp.tsx', '    "memberId",\n    "registeredAt",', '    "identityDisplay",\n    "registeredAt",')
replace_exact('apps/admin/src/AdminApp.tsx', '    "memberId",\n    "currentPlanId",', '    "identityDisplay",\n    "currentPlanId",')
replace_exact('apps/admin/src/AdminApp.tsx', '    "redeemedByMemberId",', '    "identityDisplay",')
insert_after('apps/admin/src/AdminApp.tsx', '  lineDisplayName: "LINE名稱",\n', '  identityDisplay: "LINE ID／Google ID",\n')
replace_exact(
    'apps/admin/src/AdminApp.tsx',
    '''  memberId: String(row.memberId ?? ""),\n  lineDisplayName: typeof row.lineDisplayName === "string" ? row.lineDisplayName : null,''',
    '''  memberId: String(row.memberId ?? ""),\n  identityDisplay: typeof row.identityDisplay === "string" ? row.identityDisplay : null,''',
)
replace_exact('apps/admin/src/AdminApp.tsx', '  const fields = ["memberId", "registeredAt", "lastOnlineAt", "recentOnlineMinutes", "status", "recentIp", "estimatedRegion"];', '  const fields = ["identityDisplay", "registeredAt", "lastOnlineAt", "recentOnlineMinutes", "status", "recentIp", "estimatedRegion"];')
replace_exact('apps/admin/src/AdminApp.tsx', 'sorts={[["registeredAt", "註冊時間"], ["lastOnlineAt", "最後上線時間"], ["memberId", "會員ID"]]}', 'sorts={[["registeredAt", "註冊時間"], ["lastOnlineAt", "最後上線時間"]]}')
replace_exact('apps/admin/src/AdminApp.tsx', 'sorts={[["planStartedAt", "開始時間"], ["planExpiresAt", "到期時間"], ["memberId", "會員ID"]]}', 'sorts={[["planStartedAt", "開始時間"], ["planExpiresAt", "到期時間"]]}')
replace_exact('apps/admin/src/AdminApp.tsx', '<thead><tr><th>會員ID</th><th>訂閱方案</th>', '<thead><tr><th>LINE ID／Google ID</th><th>訂閱方案</th>')
replace_exact('apps/admin/src/AdminApp.tsx', '<td>{text(row.memberId)}</td><td>{text(row.planName)}</td>', '<td>{text(row.identityDisplay)}</td><td>{text(row.planName)}</td>')
replace_exact('apps/admin/src/AdminApp.tsx', '<p>{text(editing.memberId)}</p>', '<p>{text(editing.identityDisplay)}</p>')
replace_exact('apps/admin/src/AdminApp.tsx', '<div><b>{text(row.memberId)}</b><span>{text(row.planName)}／{money(Number(row.amount))}／末五碼 {text(row.accountLastFive)}</span></div>', '<div><b>{text(row.identityDisplay)}</b><span>{text(row.planName)}／{money(Number(row.amount))}／末五碼 {text(row.accountLastFive)}</span></div>')

# User information dialog.
replace_exact(
    'apps/admin/src/UserInfoDialog.tsx',
    "    ['會員ID', value(row.memberId ?? row.id)],\n",
    "    [value(row.identityLabel || 'LINE ID／Google ID'), value(row.identityValue)],\n",
)

# Payment reversal UI keeps memberId for write targeting, but never renders it as identity.
replace_exact('apps/admin/src/PaymentReversalPanel.tsx', '  lineDisplayName?: string | null;\n', '  identityDisplay?: string | null;\n')
replace_exact(
    'apps/admin/src/PaymentReversalPanel.tsx',
    '''      const member = payment.lineDisplayName\n        ? `${payment.lineDisplayName}（${payment.memberId}）`\n        : payment.memberId;''',
    '''      const member = payment.identityDisplay || '—';''',
)
replace_exact('apps/admin/src/PaymentReversalPanel.tsx', '<strong>{payment.lineDisplayName || payment.memberId}</strong>', '<strong>{payment.identityDisplay || "—"}</strong>')

# Push notification member picker/logs must also use provider ID, never raw auth UUID.
insert_after(
    'apps/admin/backend/push-notifications.ts',
    "} from './supabase';\n",
    "import { providerIdentityFromAuthUser } from './member-provider-identity';\n",
)
replace_exact('apps/admin/backend/push-notifications.ts', '  identity_data?: Record<string, unknown> | null;\n', '  provider_id?: unknown;\n  identity_data?: Record<string, unknown> | null;\n')
replace_exact(
    'apps/admin/backend/push-notifications.ts',
    '''export type MemberPushStatus = {\n  userId: string;\n  displayName: string | null;''',
    '''export type MemberPushStatus = {\n  userId: string;\n  identityLabel: 'LINE ID' | 'Google ID' | null;\n  identityValue: string | null;\n  identityDisplay: string | null;\n  displayName: string | null;''',
)
replace_exact('apps/admin/backend/push-notifications.ts', '/rest/v1/members?select=auth_user_id%2Cline_display_name&order=auth_user_id.asc', '/rest/v1/members?select=auth_user_id%2Cline_user_id%2Cline_display_name&order=auth_user_id.asc')
replace_exact(
    'apps/admin/backend/push-notifications.ts',
    '''        const identity = lineIdentity(authUser);\n        return {\n          userId,''',
    '''        const identity = lineIdentity(authUser);\n        const providerIdentity = providerIdentityFromAuthUser(row.line_user_id, authUser);\n        return {\n          userId,\n          identityLabel: providerIdentity?.label ?? null,\n          identityValue: providerIdentity?.value ?? null,\n          identityDisplay: providerIdentity ? `${providerIdentity.label}：${providerIdentity.value}` : null,''',
)
replace_exact(
    'apps/admin/src/notification-management.ts',
    '''export type PushMember = {\n  userId: string;\n  displayName: string | null;''',
    '''export type PushMember = {\n  userId: string;\n  identityLabel: 'LINE ID' | 'Google ID' | null;\n  identityValue: string | null;\n  identityDisplay: string | null;\n  displayName: string | null;''',
)
replace_exact('apps/admin/src/NotificationManagement.tsx', '  return member.displayName || member.userId;', "  return member.identityDisplay || '—';")
replace_exact('apps/admin/src/NotificationManagement.tsx', 'alt={`${name} 的 LINE 頭貼`}', 'alt={`${name} 的會員頭貼`}')
replace_exact('apps/admin/src/NotificationManagement.tsx', '                <small>{selectedMember.userId}</small>\n', '')
replace_exact('apps/admin/src/NotificationManagement.tsx', "{membersById.has(log.userId) ? memberName(membersById.get(log.userId)!) : log.userId}", "{membersById.has(log.userId) ? memberName(membersById.get(log.userId)!) : '—'}")

# Admin tests updated to the provider-ID contract.
replace_exact(
    'apps/admin/src/UserInfoDialog.test.tsx',
    "row={{ id: 'member-1', lineDisplayName: '會員', authUserId: 'auth-1' }}",
    "row={{ id: 'member-1', identityLabel: 'Google ID', identityValue: 'google-user-456' }}",
)
replace_exact(
    'apps/admin/src/UserInfoDialog.test.tsx',
    "  expect(host.textContent).toContain('會員ID');\n  expect(host.textContent).toContain('member-1');\n  expect(host.textContent).not.toContain('驗證用戶ID');",
    "  expect(host.textContent).toContain('Google ID');\n  expect(host.textContent).toContain('google-user-456');\n  expect(host.textContent).not.toContain('會員ID');\n  expect(host.textContent).not.toContain('驗證用戶ID');",
)
replace_exact('apps/admin/src/payment-reversal-panel.test.tsx', "id: 'payment-1', memberId: 'member-1', lineDisplayName: '王小明', planName: '月費方案',", "id: 'payment-1', memberId: 'member-1', identityDisplay: 'LINE ID：line-user-1', planName: '月費方案',")
replace_exact('apps/admin/src/payment-reversal-panel.test.tsx', "message: expect.stringContaining('王小明（member-1）'),", "message: expect.stringContaining('LINE ID：line-user-1'),")

# Admin data fixtures now assert provider identity rather than provider nickname/internal UUID.
replace_exact('apps/admin/backend/admin-data.test.ts', "      line_user_id: null,", "      line_user_id: 'line-user-1',")
replace_exact(
    'apps/admin/backend/admin-data.test.ts',
    "        authUserId: 'u1',\n        lineDisplayName: '測試暱稱',",
    "        authUserId: 'u1',\n        lineUserId: 'line-user-1',\n        lineDisplayName: '測試暱稱',\n        identityLabel: 'LINE ID',\n        identityValue: 'line-user-1',\n        identityDisplay: 'LINE ID：line-user-1',",
)
replace_exact('apps/admin/backend/admin-data.test.ts', "it('maps subscription LINE nickname without exposing the LINE user ID'", "it('maps subscription LINE ID as the visible provider identity'")
replace_exact(
    'apps/admin/backend/admin-data.test.ts',
    "    expect(result.items[0]).toMatchObject({ lineDisplayName: 'LINE 暱稱' });\n    expect(result.items[0]).not.toHaveProperty('lineUserId');",
    "    expect(result.items[0]).toMatchObject({ lineUserId: 'internal-line-id', identityDisplay: 'LINE ID：internal-line-id' });",
)
replace_exact('apps/admin/backend/admin-data.test.ts', "plan: { name: '月費方案' }, member: { line_display_name: '小明' },", "plan: { name: '月費方案' }, member: { auth_user_id: 'auth-transfer', line_user_id: 'line-transfer', line_display_name: '小明' },", expected=2)
replace_exact('apps/admin/backend/admin-data.test.ts', "expect(result.items[0]).toMatchObject({ id: 'transfer-1', lineDisplayName: '小明' });", "expect(result.items[0]).toMatchObject({ id: 'transfer-1', identityDisplay: 'LINE ID：line-transfer' });")
replace_exact('apps/admin/backend/admin-data.test.ts', "expect(api.request).toHaveBeenCalledWith(expect.stringContaining('member:members(line_display_name)'));", "expect(api.request).toHaveBeenCalledWith(expect.stringContaining('member:members(auth_user_id,line_user_id,line_display_name)'));", expected=2)
replace_exact(
    'apps/admin/backend/admin-data.test.ts',
    "id: 'payment-1', memberId: 'member-1', lineDisplayName: '小明',",
    "id: 'payment-1', memberId: 'member-1', identityDisplay: 'LINE ID：line-transfer',",
)
replace_exact('apps/admin/backend/admin-data.test.ts', "redeemed_member: { id: 'member-1', line_display_name: '兌換者暱稱' },", "redeemed_member: { id: 'member-1', auth_user_id: 'auth-code', line_user_id: 'line-code', line_display_name: '兌換者暱稱' },")
replace_exact(
    'apps/admin/backend/admin-data.test.ts',
    "expect(result.items[0]).toMatchObject({ redeemedByMemberId: 'member-1', redeemedByLineDisplayName: '兌換者暱稱' });",
    "expect(result.items[0]).toMatchObject({ redeemedByMemberId: 'member-1', identityDisplay: 'LINE ID：line-code' });",
)
replace_exact('apps/admin/backend/admin-data.test.ts', 'redeemed_member:members!activation_codes_redeemed_by_member_id_fkey(id,line_display_name)', 'redeemed_member:members!activation_codes_redeemed_by_member_id_fkey(id,auth_user_id,line_user_id,line_display_name)')

# Push tests cover both LINE and Google provider IDs.
replace_exact('apps/admin/backend/push-notifications.test.ts', "{ auth_user_id: USER_ONE, line_display_name: '持久化會員一' },\n          { auth_user_id: USER_TWO, line_display_name: '持久化會員二' },", "{ auth_user_id: USER_ONE, line_user_id: 'line-user-one', line_display_name: '持久化會員一' },\n          { auth_user_id: USER_TWO, line_user_id: null, line_display_name: '持久化會員二' },")
replace_exact('apps/admin/backend/push-notifications.test.ts', "provider: 'custom:line',\n              identity_data: { name: 'LINE 會員一', picture: 'https://line.example/one.png' },", "provider: 'custom:line',\n              provider_id: 'line-user-one',\n              identity_data: { name: 'LINE 會員一', picture: 'https://line.example/one.png' },")
replace_exact('apps/admin/backend/push-notifications.test.ts', "provider: 'custom:line',\n              identity_data: { name: 'LINE 會員二', picture: 'https://line.example/two.png' },", "provider: 'google',\n              provider_id: 'google-user-two',\n              identity_data: { name: 'Google 會員二', picture: 'https://google.example/two.png' },")
replace_exact(
    'apps/admin/backend/push-notifications.test.ts',
    "        userId: USER_ONE,\n        displayName: '目前會員一',",
    "        userId: USER_ONE,\n        identityLabel: 'LINE ID',\n        identityValue: 'line-user-one',\n        identityDisplay: 'LINE ID：line-user-one',\n        displayName: '目前會員一',",
)
replace_exact(
    'apps/admin/backend/push-notifications.test.ts',
    "        userId: USER_TWO,\n        displayName: 'LINE 會員二',\n        pictureUrl: 'https://line.example/two.png',",
    "        userId: USER_TWO,\n        identityLabel: 'Google ID',\n        identityValue: 'google-user-two',\n        identityDisplay: 'Google ID：google-user-two',\n        displayName: 'Google 會員二',\n        pictureUrl: 'https://google.example/two.png',",
)
replace_exact('apps/admin/backend/push-notifications.test.ts', "/rest/v1/members?select=auth_user_id%2Cline_display_name", "/rest/v1/members?select=auth_user_id%2Cline_user_id%2Cline_display_name")

# The 1001-row pagination fixture has no provider identity; explicitly retain null display identity.
replace_exact(
    'apps/admin/backend/push-notifications.test.ts',
    "      userId: targetUserId,\n      displayName: 'target metadata',",
    "      userId: targetUserId,\n      identityLabel: null,\n      identityValue: null,\n      identityDisplay: null,\n      displayName: 'target metadata',",
)

# Frontend notification fixtures must provide provider display identity now.
for relative in ['apps/admin/src/notification-management.test.ts', 'apps/admin/src/notification-management-ui.test.tsx']:
    path = ROOT / relative
    text = path.read_text(encoding='utf-8')
    text = text.replace("userId: 'member-1', displayName:", "userId: 'member-1', identityLabel: 'LINE ID', identityValue: 'line-1', identityDisplay: 'LINE ID：line-1', displayName:")
    text = text.replace("userId: 'member-2', displayName:", "userId: 'member-2', identityLabel: 'Google ID', identityValue: 'google-2', identityDisplay: 'Google ID：google-2', displayName:")
    path.write_text(text, encoding='utf-8')
