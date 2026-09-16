import { expect, it, vi } from 'vitest';
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
      const deleted = sessions.filter((row) => token === 'eq.' + row.token_hash || (expiry?.startsWith('lte.') && new Date(String(row.expires_at)).getTime() <= new Date(expiry.slice(4)).getTime()));
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
  await auth.logout({ cookie: 'matrix_admin_session=' + second.token });
  expect(state.loginRecords[0].logout_at).toBeNull();
  expect(state.loginRecords[1].logout_at).toBe('2026-09-16T09:00:00.000Z');
  expect(state.sessions).toHaveLength(1);
});
