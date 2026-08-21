import { describe, expect, it, vi } from 'vitest';
import { getPermissions, requireAdmin, requirePermission } from './admin-auth';

const transport = (rows: unknown[]) => ({
  request: vi.fn(async () => rows),
});

describe('requireAdmin', () => {
  it('matches an AppDeploy login email to an enabled Supabase admin account', async () => {
    const api = transport([{
      id: 'a1',
      account: 'owner@example.com',
      name: 'Owner',
      role: '營運管理員',
      status: '啟用',
      can_view: true,
      can_add: true,
      can_edit: false,
      can_delete: false,
      last_login_at: null,
    }]);

    await expect(requireAdmin('OWNER@example.com', api)).resolves.toMatchObject({
      id: 'a1',
      account: 'owner@example.com',
      permissions: { view: true, add: true, edit: false, delete: false },
    });
    expect(api.request).toHaveBeenCalledWith(expect.stringContaining('admin_accounts'));
  });

  it('never auto-creates an unknown administrator', async () => {
    const api = transport([]);
    await expect(requireAdmin('unknown@example.com', api)).rejects.toMatchObject({
      statusCode: 403,
    });
    expect(api.request).toHaveBeenCalledTimes(1);
  });

  it('rejects disabled administrators', async () => {
    await expect(requireAdmin('owner@example.com', transport([{
      id: 'a1',
      account: 'owner@example.com',
      role: '超級管理員',
      status: '停用',
    }]))).rejects.toMatchObject({ statusCode: 403 });
  });
});

describe('permissions', () => {
  it('grants every permission to a super administrator', () => {
    expect(getPermissions({ role: '超級管理員' })).toEqual({
      view: true,
      add: true,
      edit: true,
      delete: true,
    });
  });

  it('enforces the requested operation permission', () => {
    expect(() => requirePermission({
      role: '查看人員',
      permissions: { view: true, add: false, edit: false, delete: false },
    }, 'add')).toThrowError('權限不足');
  });
});
