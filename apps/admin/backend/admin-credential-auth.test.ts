import { describe, expect, it, vi } from 'vitest';
import { createAdminCredentialAuth } from './admin-credential-auth';

const makeTransport = () => {
  const admins: Record<string, unknown>[] = [];
  const sessions: Record<string, unknown>[] = [];
  return { admins, sessions, transport: {
    selectRows: vi.fn(async (table: string, query: string) => table === 'admin_accounts' ? (query.includes('id=eq.') ? admins.filter((row) => query.includes(String(row.id))) : admins) : table === 'admin_sessions' ? sessions.filter((row) => query.includes(String(row.token_hash))) : []),
    insertRows: vi.fn(async (table: string, rows: unknown[]) => { if (table === 'admin_sessions') sessions.push(...rows as Record<string, unknown>[]); return rows; }),
    updateRows: vi.fn(async (table: string, query: string, record: unknown) => { if (table !== 'admin_accounts') return []; const row = admins.find((item) => query.includes(String(item.id))); if (!row) return []; Object.assign(row, record); return [row]; }),
    deleteRows: vi.fn(async () => []),
  } };
};

describe('admin credential authentication', () => {
  it('stores only derived password fields and accepts the matching password', async () => {
    const state = makeTransport();
    const auth = createAdminCredentialAuth(state.transport, () => new Date('2026-09-03T00:00:00Z'));
    const fields = await auth.passwordFields('distributed-password', true);
    expect(fields.password_hash).not.toBe('distributed-password');
    expect(fields.password_salt).not.toContain('distributed-password');
    state.admins.push({ id: 'a1', account: 'admin001', name: 'Admin', role: '營運管理員', status: '啟用', ...fields });
    const login = await auth.login('ADMIN001', 'distributed-password');
    expect(login.admin).toMatchObject({ id: 'a1', account: 'admin001', role: '營運管理員' });
    expect(state.sessions[0].token_hash).not.toBe(login.token);
  });

  it('rejects a wrong password with a generic credential error', async () => {
    const state = makeTransport();
    const auth = createAdminCredentialAuth(state.transport);
    const fields = await auth.passwordFields('correct', true);
    state.admins.push({ id: 'a1', account: 'admin001', name: 'Admin', role: '查看人員', status: '啟用', ...fields });
    await expect(auth.login('admin001', 'wrong')).rejects.toThrow('管理員帳號或密碼錯誤');
  });

  it('rejects a disabled account even with the correct password', async () => {
    const state = makeTransport();
    const auth = createAdminCredentialAuth(state.transport);
    const fields = await auth.passwordFields('correct', true);
    state.admins.push({ id: 'a1', account: 'admin001', name: 'Admin', role: '查看人員', status: '停用', ...fields });
    await expect(auth.login('admin001', 'correct')).rejects.toMatchObject({ statusCode: 403 });
  });
});
