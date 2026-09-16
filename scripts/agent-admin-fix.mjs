import { readFileSync, writeFileSync } from 'node:fs';

const mode = process.argv[2];
const read = (path) => readFileSync(path, 'utf8');
const write = (path, content) => writeFileSync(path, content);
const replaceOnce = (path, from, to) => {
  const source = read(path);
  const first = source.indexOf(from);
  if (first < 0) throw new Error(`Missing expected source in ${path}: ${from.slice(0, 120)}`);
  if (source.indexOf(from, first + from.length) >= 0) throw new Error(`Expected unique source in ${path}: ${from.slice(0, 120)}`);
  write(path, source.slice(0, first) + to + source.slice(first + from.length));
};

if (mode === 'tests') {
  write('apps/admin/src/admin-subscription-login-details.test.tsx', `// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

const dashboard = {
  todayVisitors: 0, monthVisitors: 0, totalVisitors: 0, totalUsers: 1,
  monthlyPro: 0, quarterlyPro: 1, yearlyPro: 0, expiring: 0,
  todayRevenue: 0, monthRevenue: 0, quarterRevenue: 0, yearRevenue: 0, cumulativeRevenue: 0,
};

vi.mock('@appdeploy/client', () => ({
  auth: { signIn: vi.fn(), signOut: vi.fn() },
  api: {
    get: vi.fn(async (path: string) => {
      if (path === '/api/bootstrap') return { data: { admin: { id: 'admin', role: '超級管理員', name: '管理員' } } };
      if (path === '/api/dashboard') return { data: dashboard };
      if (path.startsWith('/api/data/subscriptions?')) return { data: { items: [{
        id: 'member-1', memberDisplayName: 'Google 會員', identityDisplay: 'Google ID：google-123',
        planName: '季費', planStartedAt: '2026-09-01T00:00:00Z', planExpiresAt: '2026-12-01T00:00:00Z',
        isLifetime: false, autoRenew: true, status: 'active', registeredAt: '2026-08-01T00:00:00Z', lastOnlineAt: '2026-09-16T08:00:00Z',
      }], total: 1, currentPage: 1, totalPages: 1 } };
      if (path.startsWith('/api/data/loginRecords?')) return { data: { items: [{
        id: 'login-1', account: 'operator', loginAt: '2026-09-16T08:00:00Z', logoutAt: '2026-09-16T09:00:00Z',
        onlineMinutes: 60, ip: '203.0.113.1', estimatedRegion: '台灣・台北市', device: 'Android',
      }], total: 1, currentPage: 1, totalPages: 1 } };
      return { data: { items: [], total: 0, currentPage: 1, totalPages: 1 } };
    }),
    post: vi.fn(async () => ({ data: {} })), put: vi.fn(async () => ({ data: {} })), delete: vi.fn(async () => ({ data: {} })),
  },
}));

import AdminApp from './AdminApp';

async function renderAndOpen(label: string) {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement('div'); document.body.append(container);
  const root = createRoot(container);
  await act(async () => { root.render(<AdminApp />); });
  await waitFor(() => expect(container.querySelector('header b')?.textContent).toBe('營運概覽'));
  const button = [...container.querySelectorAll('button')].find((item) => item.textContent?.includes(label));
  expect(button).toBeTruthy();
  await act(async () => { button!.click(); });
  await waitFor(() => expect(container.querySelector('header b')?.textContent).toBe(label));
  return { container, root };
}

it('shows member name beside provider identity in subscription management', async () => {
  const { container, root } = await renderAndOpen('訂閱管理');
  try {
    const table = [...container.querySelectorAll('table')].find((item) => item.querySelector('thead')?.textContent?.includes('LINE ID／Google ID'));
    expect(table).toBeTruthy();
    expect(table!.querySelector('thead')?.textContent).toContain('會員名稱');
    expect(table!.querySelector('tbody')?.textContent).toContain('Google 會員');
    expect(table!.querySelector('tbody')?.textContent).toContain('Google ID：google-123');
  } finally { await act(async () => root.unmount()); container.remove(); }
});

it('shows logout time and estimated region while removing the current-session duration column', async () => {
  const { container, root } = await renderAndOpen('登入紀錄');
  try {
    const table = [...container.querySelectorAll('table')].find((item) => item.querySelector('thead')?.textContent?.includes('管理員帳號'));
    expect(table).toBeTruthy();
    const header = table!.querySelector('thead')?.textContent ?? '';
    const body = table!.querySelector('tbody')?.textContent ?? '';
    expect(header).toContain('登出時間');
    expect(header).toContain('推估地區');
    expect(header).not.toContain('本次在線時間');
    expect(body).toContain('台灣・台北市');
  } finally { await act(async () => root.unmount()); container.remove(); }
});
`);

  write('apps/admin/src/user-info-completeness.test.tsx', `// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { UserInfoDialog } from './UserInfoDialog';

it('shows the existing account, connection, and subscription fields without exposing internal member ids', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host);
  const client = { get: vi.fn(async () => ({ data: { items: [], hasMore: false } })) };
  await act(async () => root.render(<UserInfoDialog module="subscriptions" row={{
    id: 'member-internal-id', memberDisplayName: 'Google 會員', identityLabel: 'Google ID', identityValue: 'google-123',
    registeredAt: '2026-08-01T00:00:00Z', lastOnlineAt: '2026-09-16T08:00:00Z', status: 'active',
    recentIp: '203.0.113.1', estimatedRegion: '台灣・台北市', planName: '季費',
    planStartedAt: '2026-09-01T00:00:00Z', planExpiresAt: '2026-12-01T00:00:00Z', isLifetime: false, autoRenew: true,
  }} client={client} onClose={() => {}} />));
  const text = host.textContent ?? '';
  for (const expected of ['會員名稱', 'Google 會員', 'Google ID', 'google-123', '帳號狀態', '啟用', '最近連線IP', '203.0.113.1', '推估地區', '台灣・台北市', '訂閱方案', '季費', '方案開始時間', '方案到期時間', '自動續訂', '是']) expect(text).toContain(expected);
  expect(text).not.toContain('會員ID');
  expect(text).not.toContain('驗證用戶ID');
  expect(text).not.toContain('member-internal-id');
  await act(async () => root.unmount()); host.remove();
});
`);

  write('apps/admin/backend/admin-session-login-record.test.ts', `import { expect, it, vi } from 'vitest';
import { createAdminCredentialAuth } from './admin-credential-auth';

function makeTransport() {
  const admins: Record<string, unknown>[] = [];
  const sessions: Record<string, unknown>[] = [];
  const loginRecords: Record<string, unknown>[] = [];
  const transport = {
    selectRows: vi.fn(async (table: string, query: string) => {
      if (table === 'admin_accounts') return admins.map((row) => ({ credential_version: 0, ...row }));
      if (table === 'admin_sessions') return sessions.filter((row) => query.includes(String(row.token_hash)));
      return [];
    }),
    insertRows: vi.fn(async (table: string, rows: unknown[]) => { if (table === 'admin_sessions') sessions.push(...rows as Record<string, unknown>[]); return rows; }),
    updateRows: vi.fn(async (table: string, query: string, record: unknown) => {
      if (table === 'admin_login_records') {
        const row = loginRecords.find((item) => query.includes(String(item.id)));
        if (!row) return [];
        Object.assign(row, record); return [row];
      }
      return [];
    }),
    deleteRows: vi.fn(async (table: string, query: string) => {
      if (table !== 'admin_sessions') return [];
      const token = new URLSearchParams(query).get('token_hash');
      const expiry = new URLSearchParams(query).get('expires_at');
      const deleted = sessions.filter((row) => token === `eq.${row.token_hash}` || (expiry?.startsWith('lte.') && new Date(String(row.expires_at)).getTime() <= new Date(expiry.slice(4)).getTime()));
      for (const row of deleted) sessions.splice(sessions.indexOf(row), 1);
      return deleted;
    }),
  };
  return { admins, sessions, loginRecords, transport };
}

it('links each operator session to its own login record and closes only that record on logout', async () => {
  const state = makeTransport();
  const auth = createAdminCredentialAuth(state.transport, () => new Date('2026-09-16T09:00:00Z'));
  state.admins.push({ id: 'a1', account: 'operator', name: 'Operator', role: '營運管理員', status: '啟用', ...await auth.passwordFields('correct', true) });
  const first = await auth.login('operator', 'correct');
  const second = await auth.login('operator', 'correct');
  expect(first.loginRecordId).toMatch(/^[0-9a-f-]{36}$/i);
  expect(second.loginRecordId).toMatch(/^[0-9a-f-]{36}$/i);
  expect(first.loginRecordId).not.toBe(second.loginRecordId);
  state.loginRecords.push({ id: first.loginRecordId, logout_at: null }, { id: second.loginRecordId, logout_at: null });
  await auth.logout({ cookie: `matrix_admin_session=${second.token}` });
  expect(state.loginRecords[0].logout_at).toBeNull();
  expect(state.loginRecords[1].logout_at).toBe('2026-09-16T09:00:00.000Z');
  expect(state.sessions).toHaveLength(1);
});
`);

  write('apps/admin/backend/admin-login-logout-wiring.test.ts', `import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

it('stores the session-linked login record id in the administrator login record', () => {
  const source = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');
  expect(source).toContain("id: login.loginRecordId, admin_id: login.admin.id");
  expect(source).toContain("await credentialAuth.logout(ctx.event?.headers);");
});
`);

  write('apps/admin/backend/admin-location-normalization.test.ts', `import { expect, it, vi } from 'vitest';
import { normalizeIpAddress, lookupLocations } from './member-login-history';
import { listAdminLoginRecordPage } from './admin-data';

it('normalizes the first forwarded IP before geolocation and maps the region back to the admin record', async () => {
  expect(normalizeIpAddress('203.0.113.1, 198.51.100.2')).toBe('203.0.113.1');
  const fetcher = vi.fn(async () => new Response(JSON.stringify({ success: true, country_code: 'TW', city: 'Taipei' }), { status: 200, headers: { 'content-type': 'application/json' } }));
  vi.stubGlobal('fetch', fetcher);
  const request = vi.fn(async () => []);
  const requestPage = vi.fn(async () => ({ items: [{ id: 'r1', admin_id: 'a1', account: 'operator', login_at: '2026-09-16T08:00:00Z', logout_at: null, online_minutes: null, ip: '203.0.113.1, 198.51.100.2', device: 'Android', admin_account: { role: '營運管理員' } }], total: 1 }));
  try {
    const result = await listAdminLoginRecordPage({}, { request, requestPage } as never);
    expect(result.items[0].estimatedRegion).toBe('台灣・台北市');
    expect(String(fetcher.mock.calls[0][0])).toContain('ipwho.is/203.0.113.1?');
    expect(String(fetcher.mock.calls[0][0])).not.toContain('%2C');
  } finally { vi.unstubAllGlobals(); }
});

it('negative-caches a provider exception without hiding the record', async () => {
  const request = vi.fn(async () => []);
  const result = await lookupLocations(['203.0.113.1'], { request } as never, vi.fn(async () => { throw new Error('provider unavailable'); }));
  expect(result.get('203.0.113.1')).toBeNull();
  expect(request).toHaveBeenCalledTimes(2);
  expect(request.mock.calls[1][1]).toMatchObject({ method: 'POST' });
});
`);
  process.exit(0);
}

if (mode !== 'implementation') throw new Error('usage: node scripts/agent-admin-fix.mjs tests|implementation');

replaceOnce('apps/admin/src/AdminApp.tsx', `    "logoutAt",\n    "onlineMinutes",\n    "ip",`, `    "logoutAt",\n    "ip",`);
replaceOnce('apps/admin/src/AdminApp.tsx', `<thead><tr><th>LINE ID／Google ID</th><th>訂閱方案</th><th>開始時間</th><th>到期時間</th><th>自動續訂</th><th>調整到期日</th><th>用戶資訊</th></tr></thead>`, `<thead><tr><th>會員名稱</th><th>LINE ID／Google ID</th><th>訂閱方案</th><th>開始時間</th><th>到期時間</th><th>自動續訂</th><th>調整到期日</th><th>用戶資訊</th></tr></thead>`);
replaceOnce('apps/admin/src/AdminApp.tsx', `paged.items.length === 0 ? <tr><td colSpan={7} className="empty">`, `paged.items.length === 0 ? <tr><td colSpan={8} className="empty">`);
replaceOnce('apps/admin/src/AdminApp.tsx', `<tr key={row.id}>\n              <td>{text(row.identityDisplay)}</td><td>{text(row.planName)}</td>`, `<tr key={row.id}>\n              <td>{text(row.memberDisplayName)}</td><td>{text(row.identityDisplay)}</td><td>{text(row.planName)}</td>`);

replaceOnce('apps/admin/src/UserInfoDialog.tsx', `  const value = (input: unknown) => input == null || input === '' ? '—' : String(input);\n  const fields = [\n    ['會員名稱', value(row.memberDisplayName)],\n    [value(row.identityLabel || 'LINE ID／Google ID'), value(row.identityValue)],\n    ['註冊時間', formatAdminDateTime(row.registeredAt)],\n    ['最後上線時間', formatAdminDateTime(row.lastOnlineAt)],\n  ];`, `  const value = (input: unknown) => input == null || input === '' ? '—' : String(input);\n  const statusValue = (input: unknown) => {\n    const status = String(input ?? '');\n    if (['disabled', 'inactive', '停用'].includes(status)) return '停用';\n    if (['active', '啟用'].includes(status)) return '啟用';\n    return value(input);\n  };\n  const fields: Array<[string, string]> = [\n    ['會員名稱', value(row.memberDisplayName ?? row.lineDisplayName)],\n    [value(row.identityLabel || 'LINE ID／Google ID'), value(row.identityValue)],\n    ['註冊時間', formatAdminDateTime(row.registeredAt)],\n    ['最後上線時間', formatAdminDateTime(row.lastOnlineAt)],\n  ];\n  if ('status' in row) fields.push(['帳號狀態', statusValue(row.status)]);\n  if ('recentIp' in row) fields.push(['最近連線IP', value(row.recentIp)]);\n  if ('estimatedRegion' in row) fields.push(['推估地區', value(row.estimatedRegion)]);\n  if (module === 'subscriptions') {\n    fields.push(\n      ['訂閱方案', value(row.planName)],\n      ['方案開始時間', formatAdminDateTime(row.planStartedAt)],\n      ['方案到期時間', row.isLifetime ? '終生' : formatAdminDateTime(row.planExpiresAt)],\n    );\n    if ('autoRenew' in row) fields.push(['自動續訂', row.autoRenew ? '是' : '否']);\n  }`);

replaceOnce('apps/admin/backend/admin-credential-auth.ts', `import { getModulePermissions, getPermissions, type AdminAccount } from './admin-auth';`, `import { getModulePermissions, getPermissions, shouldRecordAdminActivity, type AdminAccount } from './admin-auth';`);
replaceOnce('apps/admin/backend/admin-credential-auth.ts', `    const loginTime = now();\n    const token = randomBase64Url(32);\n    await transport.insertRows('admin_sessions', [{ token_hash: await digestHex(token), admin_id: row.id, credential_version: row.credential_version, expires_at: new Date(loginTime.getTime() + sessionSeconds * 1000).toISOString() }]);`, `    const loginTime = now();\n    const token = randomBase64Url(32);\n    const loginRecordId = shouldRecordAdminActivity(mapAdmin(row)) ? crypto.randomUUID() : null;\n    await transport.insertRows('admin_sessions', [{ token_hash: await digestHex(token), admin_id: row.id, credential_version: row.credential_version, login_record_id: loginRecordId, expires_at: new Date(loginTime.getTime() + sessionSeconds * 1000).toISOString() }]);`);
replaceOnce('apps/admin/backend/admin-credential-auth.ts', `    return { admin, token };`, `    return { admin, token, loginRecordId };`);
replaceOnce('apps/admin/backend/admin-credential-auth.ts', `  const logout = async (headers?: Record<string, string | undefined>) => {\n    const token = cookieToken(headers);\n    if (token) await transport.deleteRows('admin_sessions', \`token_hash=eq.\${encodeURIComponent(await digestHex(token))}\`);\n  };`, `  const logout = async (headers?: Record<string, string | undefined>) => {\n    const token = cookieToken(headers);\n    if (!token) return;\n    const tokenHash = await digestHex(token);\n    const sessions = await transport.selectRows<Row>('admin_sessions', \`select=login_record_id&token_hash=eq.\${encodeURIComponent(tokenHash)}&limit=1\`);\n    const loginRecordId = typeof sessions[0]?.login_record_id === 'string' ? sessions[0].login_record_id : '';\n    if (loginRecordId) {\n      await transport.updateRows('admin_login_records', \`id=eq.\${encodeURIComponent(loginRecordId)}&logout_at=is.null\`, { logout_at: now().toISOString() });\n    }\n    await transport.deleteRows('admin_sessions', \`token_hash=eq.\${encodeURIComponent(tokenHash)}\`);\n  };`);

replaceOnce('apps/admin/backend/index.ts', `supabase.insertRows('admin_login_records', [{ admin_id: login.admin.id, account: login.admin.account, login_at: lastLoginAt, ...requestMetadata(ctx) }]),`, `supabase.insertRows('admin_login_records', [{ id: login.loginRecordId, admin_id: login.admin.id, account: login.admin.account, login_at: lastLoginAt, ...requestMetadata(ctx) }]),`);

replaceOnce('apps/admin/backend/member-login-history.ts', `const ipText = (value: unknown) => typeof value === 'string' && /^[0-9a-f:.]+$/i.test(value) ? value : null;`, `export const normalizeIpAddress = (value: unknown) => {\n  if (typeof value !== 'string') return null;\n  const first = value.split(',')[0]?.trim() ?? '';\n  return first && /^[0-9a-f:.]+$/i.test(first) ? first : null;\n};`);
replaceOnce('apps/admin/backend/member-login-history.ts', `  const unique = [...new Set(ips.filter((ip): ip is string => !!ip))];`, `  const unique = [...new Set(ips.map(normalizeIpAddress).filter((ip): ip is string => !!ip))];`);
replaceOnce('apps/admin/backend/member-login-history.ts', `    for (const row of cached) {\n      if (Date.now() - Date.parse(String(row.checked_at)) < (row.country_code ? 7 * 86400000 : 3600000)) result.set(String(row.ip), locationLabel(row));\n    }`, `    for (const row of cached) {\n      const key = normalizeIpAddress(row.ip);\n      if (key && Date.now() - Date.parse(String(row.checked_at)) < (row.country_code ? 7 * 86400000 : 3600000)) result.set(key, locationLabel(row));\n    }`);
replaceOnce('apps/admin/backend/member-login-history.ts', `    try {\n      const response = await fetcher(\`https://ipwho.is/\${encodeURIComponent(ip)}?fields=success,country_code,city\`, { signal: AbortSignal.timeout(2500) });\n      if (response.ok) {\n        const data = await response.json() as Row;\n        if (data.success === true && typeof data.country_code === 'string' && /^[A-Z]{2}$/.test(data.country_code)) row = { ...row, country_code: data.country_code, city: typeof data.city === 'string' ? data.city.slice(0, 100) : null };\n      }\n      await api.request('/rest/v1/member_ip_locations?on_conflict=ip', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(row) });\n    } catch { /* Missing location must not hide member records. */ }\n    result.set(ip, locationLabel(row));`, `    try {\n      const response = await fetcher(\`https://ipwho.is/\${encodeURIComponent(ip)}?fields=success,country_code,city\`, { signal: AbortSignal.timeout(2500) });\n      if (response.ok) {\n        const data = await response.json() as Row;\n        if (data.success === true && typeof data.country_code === 'string' && /^[A-Z]{2}$/.test(data.country_code)) row = { ...row, country_code: data.country_code, city: typeof data.city === 'string' ? data.city.slice(0, 100) : null };\n      }\n    } catch { /* Missing location must not hide member records. */ }\n    try {\n      await api.request('/rest/v1/member_ip_locations?on_conflict=ip', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(row) });\n    } catch { /* A cache write failure must not hide member records. */ }\n    result.set(ip, locationLabel(row));`);
replaceOnce('apps/admin/backend/member-login-history.ts', `const locations = await lookupLocations(rows.map(row => ipText(row.last_connection_ip)), api).catch(() => new Map<string, string | null>());\n  for (const row of rows) { const ip = ipText(row.last_connection_ip);`, `const locations = await lookupLocations(rows.map(row => normalizeIpAddress(row.last_connection_ip)), api).catch(() => new Map<string, string | null>());\n  for (const row of rows) { const ip = normalizeIpAddress(row.last_connection_ip);`);
replaceOnce('apps/admin/backend/member-login-history.ts', `const locations = await lookupLocations(items.map(row => ipText(row.login_ip)), api).catch(() => new Map<string, string | null>());\n  return { items: items.map(row => { const ip = ipText(row.login_ip);`, `const locations = await lookupLocations(items.map(row => normalizeIpAddress(row.login_ip)), api).catch(() => new Map<string, string | null>());\n  return { items: items.map(row => { const ip = normalizeIpAddress(row.login_ip);`);

replaceOnce('apps/admin/backend/admin-data.ts', `import { lookupLocations, memberConnectionSummaries } from './member-login-history';`, `import { lookupLocations, memberConnectionSummaries, normalizeIpAddress } from './member-login-history';`);
replaceOnce('apps/admin/backend/admin-data.ts', `async function enrichLoginRecords(items: Array<Row & { id: string }>, api: Requester) {\n  const ips = items.map(item => typeof item.ip === 'string' ? item.ip : null);\n  const locations = await lookupLocations(ips, api).catch(() => new Map<string, string | null>());\n  return items.map(item => ({ ...item, estimatedRegion: typeof item.ip === 'string' ? locations.get(item.ip) || null : null }));\n}`, `async function enrichLoginRecords(items: Array<Row & { id: string }>, api: Requester) {\n  const ips = items.map(item => normalizeIpAddress(item.ip));\n  const locations = await lookupLocations(ips, api).catch(() => new Map<string, string | null>());\n  return items.map((item, index) => ({ ...item, estimatedRegion: ips[index] ? locations.get(ips[index]!) || null : null }));\n}`);

replaceOnce('apps/admin/DESIGN.md', `第一卡四個欄位以 92px 標籤欄對齊；窄版標籤欄 84px、卡片內距 10px，IP 與 ID 可斷行。`, `第一卡保留會員名稱、登入身分、註冊時間與最後上線時間，並依目前資料列補上既有帳號狀態、最近連線 IP、推估地區，以及訂閱頁既有方案／開始／到期／自動續訂資訊；不顯示會員內部 ID。標籤欄以 92px 對齊；窄版標籤欄 84px、卡片內距 10px，IP 與登入身分可斷行。`);
replaceOnce('apps/admin/DESIGN.md', `訂閱管理只列出未到期、啟用中且方案天數為 30／90／365 的成功訂閱會員；月費、季費、年費直接排列在同一張表，不切換清單。`, `訂閱管理只列出未到期、啟用中且方案天數為 30／90／365 的成功訂閱會員；月費、季費、年費直接排列在同一張表，不切換清單。會員名稱與 LINE ID／Google ID 分欄顯示，沿用同一筆會員資料。`);
replaceOnce('apps/admin/DESIGN.md', `主選單的登入紀錄每頁 10 筆，IP 後緊接推估地區欄；`, `主選單的登入紀錄每頁 10 筆，顯示登入時間、登出時間、IP、推估地區與裝置資訊，不顯示「本次在線時間」；IP 後緊接推估地區欄；`);

write('supabase/migrations/20260916095200_admin_session_login_record_link.sql', `alter table public.admin_sessions\n  add column if not exists login_record_id uuid;\n\ncreate unique index if not exists admin_sessions_login_record_id_key\n  on public.admin_sessions (login_record_id)\n  where login_record_id is not null;\n`);
