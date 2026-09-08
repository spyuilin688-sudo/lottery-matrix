import { describe, expect, it, vi } from 'vitest';
import { createAdminCredentialAuth } from './admin-credential-auth';

const makeTransport = () => {
  const admins: Record<string, unknown>[] = [];
  const sessions: Record<string, unknown>[] = [];
  return { admins, sessions, transport: {
    selectRows: vi.fn(async (table: string, query: string) => table === 'admin_accounts' ? (query.includes('id=eq.') ? admins.filter((row) => query.includes(String(row.id))) : admins).map(row => ({ credential_version: 0, ...row })) : table === 'admin_sessions' ? sessions.filter((row) => query.includes(String(row.token_hash))) : []),
    insertRows: vi.fn(async (table: string, rows: unknown[]) => { if (table === 'admin_sessions') sessions.push(...rows as Record<string, unknown>[]); return rows; }),
    updateRows: vi.fn(async (table: string, query: string, record: unknown) => { if (table !== 'admin_accounts') return []; const row = admins.find((item) => query.includes(String(item.id))); if (!row) return []; Object.assign(row, record); return [row]; }),
    deleteRows: vi.fn(async (table: string, query: string) => {
      if (table !== 'admin_sessions') return [];
      const params = new URLSearchParams(query);
      const expiry = params.get('expires_at');
      const token = params.get('token_hash');
      const deleted = sessions.filter((row) => expiry?.startsWith('lte.')
        ? new Date(String(row.expires_at)).getTime() <= new Date(expiry.slice(4)).getTime()
        : token === `eq.${row.token_hash}`);
      for (const row of deleted) sessions.splice(sessions.indexOf(row), 1);
      return deleted;
    }),
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

  it('preserves stored operation permissions across login and session reload', async () => {
    const state = makeTransport();
    const auth = createAdminCredentialAuth(state.transport, () => new Date('2026-09-03T00:00:00Z'));
    const fields = await auth.passwordFields('distributed-password', true);
    state.admins.push({
      id: 'a1',
      account: 'admin001',
      name: 'Admin',
      role: '營運管理員',
      status: '啟用',
      can_view: false,
      can_add: false,
      can_edit: false,
      can_delete: true,
      ...fields,
    });

    const login = await auth.login('admin001', 'distributed-password');
    expect(login.admin.permissions).toEqual({ view: false, add: false, edit: false, delete: true });
    await expect(auth.getAdminFromHeaders({
      cookie: `matrix_admin_session=${login.token}`,
    })).resolves.toMatchObject({
      permissions: { view: false, add: false, edit: false, delete: true },
    });
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


describe('expired session maintenance', () => {
  it('removes expired sessions including the expiry boundary on login while preserving active sessions', async () => {
    const state = makeTransport();
    const auth = createAdminCredentialAuth(state.transport, () => new Date('2026-09-06T00:00:00Z'));
    state.admins.push({ id: 'a1', account: 'admin001', status: '啟用', ...await auth.passwordFields('correct', true) });
    state.sessions.push(
      { token_hash: 'expired', expires_at: '2026-09-05T23:59:59.999Z' },
      { token_hash: 'boundary', expires_at: '2026-09-06T00:00:00.000Z' },
      { token_hash: 'active', expires_at: '2026-09-06T00:00:00.001Z' },
    );
    const login = await auth.login('admin001', 'correct');
    expect(state.sessions).toHaveLength(2);
    expect(state.sessions[0].token_hash).toBe('active');
    expect(state.transport.deleteRows).toHaveBeenCalledExactlyOnceWith('admin_sessions', 'expires_at=lte.2026-09-06T00%3A00%3A00.000Z');
    await expect(auth.getAdminFromHeaders({ cookie: `matrix_admin_session=${login.token}` })).resolves.toMatchObject({ id: 'a1' });
    expect(state.transport.deleteRows).toHaveBeenCalledTimes(1);
  });

  it('isolates cleanup failure from successful login', async () => {
    const state = makeTransport();
    const auth = createAdminCredentialAuth(state.transport);
    state.admins.push({ id: 'a1', account: 'admin001', status: '啟用', ...await auth.passwordFields('correct', true) });
    state.transport.deleteRows.mockRejectedValueOnce(new Error('cleanup unavailable'));
    await expect(auth.login('admin001', 'correct')).resolves.toMatchObject({ admin: { id: 'a1' } });
    expect(state.transport.deleteRows).toHaveBeenCalledTimes(1);
    expect(state.sessions).toHaveLength(1);
  });

  it('allows login after 1500ms when cleanup never settles', async () => {
    const state = makeTransport();
    const auth = createAdminCredentialAuth(state.transport);
    state.admins.push({ id: 'a1', account: 'admin001', status: '啟用', ...await auth.passwordFields('correct', true) });
    let cleanupStarted!: () => void;
    const started = new Promise<void>((resolve) => { cleanupStarted = resolve; });
    state.transport.deleteRows.mockImplementationOnce(() => {
      cleanupStarted();
      return new Promise(() => {});
    });
    vi.useFakeTimers();
    try {
      let resolved = false;
      const login = auth.login('admin001', 'correct').then((result) => { resolved = true; return result; });
      await started;
      await vi.advanceTimersByTimeAsync(1499);
      expect(resolved).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      expect(resolved).toBe(true);
      await expect(login).resolves.toMatchObject({ admin: { id: 'a1' } });
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not perform maintenance on rejected credentials or disabled logins', async () => {
    const state = makeTransport();
    const auth = createAdminCredentialAuth(state.transport);
    state.admins.push({ id: 'a1', account: 'admin001', status: '停用', ...await auth.passwordFields('correct', true) });
    await expect(auth.login('admin001', 'wrong')).rejects.toThrow();
    await expect(auth.login('admin001', 'correct')).rejects.toMatchObject({ statusCode: 403 });
    expect(state.transport.deleteRows).not.toHaveBeenCalled();
  });
});

 describe('credential version revocation', () => {
  it('rejects a session after a password version change and accepts a new login', async () => {
    const state = makeTransport();
    const auth = createAdminCredentialAuth(state.transport);
    state.admins.push({id:'a1',account:'admin001',status:'啟用',credential_version:0,...await auth.passwordFields('old',true)});
    const oldLogin = await auth.login('admin001','old');
    await auth.setPassword('a1','new');
    // The SQL trigger increments this atomically; leave a late old session to test fail-closed validation.
    state.admins[0].credential_version = 1;
    await expect(auth.getAdminFromHeaders({cookie:`matrix_admin_session=${oldLogin.token}`})).rejects.toThrow('管理員登入已失效');
    const fresh = await auth.login('admin001','new');
    await expect(auth.getAdminFromHeaders({cookie:`matrix_admin_session=${fresh.token}`})).resolves.toMatchObject({id:'a1'});
    await expect(auth.login('admin001','old')).rejects.toThrow();
  });
  it('rejects an old-password login delayed until after credentials change', async () => {
    const state = makeTransport();
    const auth = createAdminCredentialAuth(state.transport);
    state.admins.push({id:'a1',account:'admin001',status:'啟用',credential_version:0,...await auth.passwordFields('old',true)});
    let release!:()=>void; let reached!:()=>void;
    const started = new Promise<void>(resolve => {reached=resolve;});
    const gate = new Promise<void>(resolve => {release=resolve;});
    state.transport.insertRows.mockImplementationOnce(async (_table,rows) => {
      reached(); await gate; state.sessions.push(...rows as Record<string,unknown>[]); return rows;
    });
    const login = auth.login('admin001','old');
    const rejected = expect(login).rejects.toThrow('管理員登入已失效');
    await started;
    Object.assign(state.admins[0], await auth.passwordFields('new',true), {credential_version:1});
    release(); await rejected;
  });
 });
