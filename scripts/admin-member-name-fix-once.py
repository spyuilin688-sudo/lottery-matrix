from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def replace_exact(relative: str, old: str, new: str, expected: int = 1) -> None:
    path = ROOT / relative
    text = path.read_text(encoding='utf-8')
    count = text.count(old)
    if count != expected:
        raise SystemExit(f'{relative}: expected {expected} occurrence(s), found {count}: {old[:140]!r}')
    path.write_text(text.replace(old, new), encoding='utf-8')


# Backend identity helper: retain provider ID and restore a provider-neutral visible name.
replace_exact(
    'apps/admin/backend/member-provider-identity.ts',
    '''export type AuthUserForIdentity = {\n  id?: unknown;\n  identities?: AuthUserIdentity[] | null;\n};''',
    '''export type AuthUserForIdentity = {\n  id?: unknown;\n  user_metadata?: Record<string, unknown> | null;\n  identities?: AuthUserIdentity[] | null;\n};''',
)
replace_exact(
    'apps/admin/backend/member-provider-identity.ts',
    '''export function providerIdentityFromAuthUser(\n  lineUserId: unknown,\n  authUser: AuthUserForIdentity | undefined | null,\n): AdminProviderIdentity | null {''',
    '''export function memberDisplayNameFromAuthUser(\n  storedDisplayName: unknown,\n  authUser: AuthUserForIdentity | undefined | null,\n) {\n  const stored = optionalString(storedDisplayName);\n  if (stored) return stored;\n  const metadata = authUser?.user_metadata;\n  const metadataName = optionalString(metadata?.name) ?? optionalString(metadata?.full_name);\n  if (metadataName) return metadataName;\n  for (const identity of authUser?.identities ?? []) {\n    const identityName = optionalString(identity.identity_data?.name)\n      ?? optionalString(identity.identity_data?.full_name);\n    if (identityName) return identityName;\n  }\n  return null;\n}\n\nexport function providerIdentityFromAuthUser(\n  lineUserId: unknown,\n  authUser: AuthUserForIdentity | undefined | null,\n): AdminProviderIdentity | null {''',
)

# Admin API rows: name and provider ID are separate fields; neither replaces the other.
replace_exact(
    'apps/admin/backend/admin-data.ts',
    "import { providerIdentityFromAuthUser, type AuthUserForIdentity } from './member-provider-identity';",
    "import { memberDisplayNameFromAuthUser, providerIdentityFromAuthUser, type AuthUserForIdentity } from './member-provider-identity';",
)
replace_exact(
    'apps/admin/backend/admin-data.ts',
    '''  return items.map((item) => {\n    const identity = providerIdentityFromAuthUser(item.lineUserId, byId.get(String(item.authUserId ?? '')));\n    return {\n      ...item,\n      identityLabel: identity?.label ?? null,\n      identityValue: identity?.value ?? null,\n      identityDisplay: identity ? `${identity.label}：${identity.value}` : null,\n    };\n  });''',
    '''  return items.map((item) => {\n    const authUser = byId.get(String(item.authUserId ?? ''));\n    const identity = providerIdentityFromAuthUser(item.lineUserId, authUser);\n    return {\n      ...item,\n      memberDisplayName: memberDisplayNameFromAuthUser(item.lineDisplayName, authUser),\n      identityLabel: identity?.label ?? null,\n      identityValue: identity?.value ?? null,\n      identityDisplay: identity ? `${identity.label}：${identity.value}` : null,\n    };\n  });''',
)

# Existing exact-shape backend test now includes the deliberately restored display-name field.
replace_exact(
    'apps/admin/backend/admin-data.test.ts',
    '''        lineUserId: 'line-user-1',\n        lineDisplayName: '測試暱稱',\n        identityLabel: 'LINE ID',''',
    '''        lineUserId: 'line-user-1',\n        lineDisplayName: '測試暱稱',\n        memberDisplayName: '測試暱稱',\n        identityLabel: 'LINE ID',''',
)

# User management: restore member name as its own column, while keeping LINE/Google ID.
replace_exact(
    'apps/admin/src/AdminApp.tsx',
    '''  users: [\n    "identityDisplay",\n    "registeredAt",''',
    '''  users: [\n    "memberDisplayName",\n    "identityDisplay",\n    "registeredAt",''',
)
replace_exact(
    'apps/admin/src/AdminApp.tsx',
    '''  lineDisplayName: "LINE名稱",\n  identityDisplay: "LINE ID／Google ID",''',
    '''  lineDisplayName: "LINE名稱",\n  memberDisplayName: "會員名稱",\n  identityDisplay: "LINE ID／Google ID",''',
)
replace_exact(
    'apps/admin/src/AdminApp.tsx',
    '''  const fields = ["identityDisplay", "registeredAt", "lastOnlineAt", "recentOnlineMinutes", "status", "recentIp", "estimatedRegion"];''',
    '''  const fields = ["memberDisplayName", "identityDisplay", "registeredAt", "lastOnlineAt", "recentOnlineMinutes", "status", "recentIp", "estimatedRegion"];''',
)

# User info dialog: restore the name without removing provider ID.
replace_exact(
    'apps/admin/src/UserInfoDialog.tsx',
    '''  const fields = [\n    [value(row.identityLabel || 'LINE ID／Google ID'), value(row.identityValue)],\n    ['註冊時間', formatAdminDateTime(row.registeredAt)],''',
    '''  const fields = [\n    ['會員名稱', value(row.memberDisplayName)],\n    [value(row.identityLabel || 'LINE ID／Google ID'), value(row.identityValue)],\n    ['註冊時間', formatAdminDateTime(row.registeredAt)],''',
)
replace_exact(
    'apps/admin/src/UserInfoDialog.test.tsx',
    '''  await act(async () => root.render(<UserInfoDialog row={{ id: 'member-1', identityLabel: 'Google ID', identityValue: 'google-user-456' }} client={{ get }} onClose={() => {}} />));\n  expect(host.querySelectorAll('.memberInfoCard')).toHaveLength(2);\n  expect(host.querySelectorAll('dl > div')).toHaveLength(3);\n  expect(host.textContent).toContain('Google ID');''',
    '''  await act(async () => root.render(<UserInfoDialog row={{ id: 'member-1', memberDisplayName: '余翊翔', identityLabel: 'Google ID', identityValue: 'google-user-456' }} client={{ get }} onClose={() => {}} />));\n  expect(host.querySelectorAll('.memberInfoCard')).toHaveLength(2);\n  expect(host.querySelectorAll('dl > div')).toHaveLength(4);\n  expect(host.textContent).toContain('會員名稱');\n  expect(host.textContent).toContain('余翊翔');\n  expect(host.textContent).toContain('Google ID');''',
)
