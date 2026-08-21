import { describe, expect, it, vi } from 'vitest';
import { createAdminData } from './admin-data';

const actor = { id: 'admin-1', account: 'admin@example.com', name: '管理員' };
const input = {
  account: 'new@example.com',
  name: '新管理員',
  role: '查看人員',
  status: '啟用',
  can_view: true,
  can_add: false,
  can_edit: false,
  can_delete: false,
};

describe('authorized Supabase writes', () => {
  it('updates only the signed-in administrator name and writes an audit record', async () => {
    const updateRows = vi.fn(async () => [{
      id: 'admin-1',
      account: 'admin@example.com',
      name: '新的名稱',
      role: '查看人員',
      status: '啟用',
      can_view: true,
      can_add: false,
      can_edit: false,
      can_delete: false,
    }]);
    const insertRows = vi.fn(async () => [{ id: 'audit-1' }]);
    const data = createAdminData({
      insertRows,
      selectRows: vi.fn(async () => [{
        id: 'admin-1',
        account: 'admin@example.com',
        name: '管理員',
      }]),
      updateRows,
      deleteRows: vi.fn(async () => []),
      supabaseRequest: vi.fn(async () => []),
    });

    await expect(data.updateOwnAdminName('新的名稱', actor)).resolves.toMatchObject({
      id: 'admin-1',
      account: 'admin@example.com',
      name: '新的名稱',
    });
    expect(updateRows).toHaveBeenCalledWith(
      'admin_accounts',
      'id=eq.admin-1',
      { name: '新的名稱' },
    );
    expect(insertRows).toHaveBeenCalledWith('audit_logs', [expect.objectContaining({
      admin_id: 'admin-1',
      operation_type: '修改',
      target_id: 'admin-1',
      content: '修改本人管理員名稱',
    })]);
  });

  it('rejects an empty own name before writing to Supabase', async () => {
    const updateRows = vi.fn();
    const data = createAdminData({
      insertRows: vi.fn(),
      selectRows: vi.fn(),
      updateRows,
      deleteRows: vi.fn(),
      supabaseRequest: vi.fn(),
    });

    await expect(data.updateOwnAdminName('   ', actor)).rejects.toMatchObject({
      statusCode: 400,
    });
    expect(updateRows).not.toHaveBeenCalled();
  });

  it('writes one audit record only after a successful mutation', async () => {
    const calls: string[] = [];
    const data = createAdminData({
      insertRows: vi.fn(async (table: string) => {
        calls.push(`insert:${table}`);
        return table === 'admin_accounts'
          ? [{ id: 'new', ...input, last_login_at: null, created_at: '2026-08-21T00:00:00Z' }]
          : [{ id: 'audit' }];
      }),
      selectRows: vi.fn(async () => []),
      updateRows: vi.fn(async () => []),
      deleteRows: vi.fn(async () => []),
      supabaseRequest: vi.fn(async () => []),
    });

    await data.createAdminAccount(input, actor);
    expect(calls).toEqual(['insert:admin_accounts', 'insert:audit_logs']);
  });

  it('does not write audit records for a super administrator', async () => {
    const insertRows = vi.fn(async (table: string) => table === 'admin_accounts'
      ? [{ id: 'new', ...input, last_login_at: null, created_at: '2026-08-21T00:00:00Z' }]
      : [{ id: 'audit' }]);
    const data = createAdminData({
      insertRows,
      selectRows: vi.fn(async () => []),
      updateRows: vi.fn(async () => []),
      deleteRows: vi.fn(async () => []),
      supabaseRequest: vi.fn(async () => []),
    });

    await data.createAdminAccount(input, { ...actor, role: '超級管理員' });

    expect(insertRows).toHaveBeenCalledTimes(1);
    expect(insertRows).toHaveBeenCalledWith('admin_accounts', [expect.any(Object)]);
  });

  it('does not audit a failed mutation', async () => {
    const insertRows = vi.fn(async () => { throw new Error('insert failed'); });
    const data = createAdminData({
      insertRows,
      selectRows: vi.fn(async () => []),
      updateRows: vi.fn(async () => []),
      deleteRows: vi.fn(async () => []),
      supabaseRequest: vi.fn(async () => []),
    });

    await expect(data.createAdminAccount(input, actor)).rejects.toThrow('insert failed');
    expect(insertRows).toHaveBeenCalledTimes(1);
  });

  it('creates exactly ten activation codes through the database RPC', async () => {
    const rpc = vi.fn(async () => Array.from({ length: 10 }, (_, index) => ({
      id: String(index + 1),
      batch_id: 'batch-1',
    })));
    const data = createAdminData({
      supabaseRequest: rpc,
      insertRows: vi.fn(async () => [{ id: 'audit-1' }]),
      selectRows: vi.fn(async () => []),
      updateRows: vi.fn(async () => []),
      deleteRows: vi.fn(async () => []),
    });

    await expect(data.generateActivationCodeBatch('30_days', actor)).resolves.toEqual({
      batchId: 'batch-1',
      count: 10,
    });
    expect(rpc).toHaveBeenCalledWith('rpc/generate_activation_code_batch', {
      method: 'POST',
      body: JSON.stringify({ p_duration_type: '30_days' }),
    });
  });

  it('rejects invalid activation durations before calling Supabase', async () => {
    const rpc = vi.fn();
    const data = createAdminData({
      supabaseRequest: rpc,
      insertRows: vi.fn(),
      selectRows: vi.fn(),
      updateRows: vi.fn(),
      deleteRows: vi.fn(),
    });

    await expect(data.generateActivationCodeBatch('30', actor)).rejects.toMatchObject({ statusCode: 400 });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('rejects deleting the signed-in administrator', async () => {
    const deleteRows = vi.fn();
    const data = createAdminData({
      insertRows: vi.fn(),
      selectRows: vi.fn(),
      updateRows: vi.fn(),
      deleteRows,
      supabaseRequest: vi.fn(),
    });

    await expect(data.deleteAdminAccount('admin-1', actor)).rejects.toMatchObject({
      statusCode: 400,
    });
    expect(deleteRows).not.toHaveBeenCalled();
  });

  it('keeps the last enabled super administrator during deletion', async () => {
    const deleteRows = vi.fn();
    const selectRows = vi.fn(async (_table: string, query: string) => {
      if (query.includes('id=eq.super-1')) return [{ id: 'super-1', role: '超級管理員', status: '啟用' }];
      return [{ id: 'super-1' }];
    });
    const data = createAdminData({
      insertRows: vi.fn(), selectRows, updateRows: vi.fn(), deleteRows,
      supabaseRequest: vi.fn(),
    });

    await expect(data.deleteAdminAccount('super-1', actor)).rejects.toMatchObject({ statusCode: 400 });
    expect(deleteRows).not.toHaveBeenCalled();
  });

  it('keeps the last enabled super administrator during role or status changes', async () => {
    const updateRows = vi.fn();
    const selectRows = vi.fn(async (_table: string, query: string) => {
      if (query.includes('id=eq.super-1')) return [{
        id: 'super-1', account: 'super@example.com', name: 'Super', role: '超級管理員', status: '啟用',
      }];
      return [{ id: 'super-1' }];
    });
    const data = createAdminData({
      insertRows: vi.fn(), selectRows, updateRows, deleteRows: vi.fn(),
      supabaseRequest: vi.fn(),
    });

    await expect(data.updateAdminAccount('super-1', {
      ...input,
      account: 'super@example.com',
      name: 'Super',
      role: '查看人員',
    }, actor)).rejects.toMatchObject({ statusCode: 400 });
    expect(updateRows).not.toHaveBeenCalled();
  });

  it('enables or disables a member and audits the change', async () => {
    const rpc = vi.fn(async () => ({ id: 'member-1', status: 'disabled' }));
    const data = createAdminData({
      insertRows: vi.fn(), selectRows: vi.fn(), updateRows: vi.fn(), deleteRows: vi.fn(), supabaseRequest: rpc,
    });

    await expect(data.updateMemberStatus('member-1', 'disabled', actor)).resolves.toMatchObject({
      id: 'member-1', status: 'disabled',
    });
    expect(rpc).toHaveBeenCalledWith('rpc/admin_set_member_status', expect.objectContaining({ method: 'POST' }));
  });

  it('cancels automatic renewal without removing the current expiry', async () => {
    const rpc = vi.fn(async () => ({ id: 'member-1', plan_expires_at: '2026-09-20T00:00:00.000Z', auto_renew: false }));
    const data = createAdminData({
      insertRows: vi.fn(), selectRows: vi.fn(), updateRows: vi.fn(), deleteRows: vi.fn(), supabaseRequest: rpc,
    });

    await data.updateSubscription('member-1', { action: 'cancel' }, actor, new Date('2026-08-21T00:00:00Z'));
    expect(rpc).toHaveBeenCalledWith('rpc/admin_update_subscription', expect.objectContaining({
      body: expect.stringContaining('"p_action":"cancel"'),
    }));
  });

  it('activates and renews a selected plan using its configured duration', async () => {
    const rpc = vi.fn(async () => ({ id: 'member-1' }));
    const data = createAdminData({
      insertRows: vi.fn(), selectRows: vi.fn(), updateRows: vi.fn(), deleteRows: vi.fn(), supabaseRequest: rpc,
    });

    await data.updateSubscription('member-1', { action: 'activate', planId: 'plan-30' }, actor, new Date('2026-08-21T00:00:00Z'));
    await data.updateSubscription('member-1', { action: 'renew', planId: 'plan-30' }, actor, new Date('2026-08-21T00:00:00Z'));
    expect(rpc).toHaveBeenNthCalledWith(1, 'rpc/admin_update_subscription', expect.objectContaining({ body: expect.stringContaining('"p_action":"activate"') }));
    expect(rpc).toHaveBeenNthCalledWith(2, 'rpc/admin_update_subscription', expect.objectContaining({ body: expect.stringContaining('"p_action":"renew"') }));
  });

  it('adjusts expiry and supports a lifetime subscription', async () => {
    const rpc = vi.fn(async () => ({ id: 'member-1' }));
    const data = createAdminData({
      insertRows: vi.fn(), selectRows: vi.fn(), updateRows: vi.fn(), deleteRows: vi.fn(), supabaseRequest: rpc,
    });

    await data.updateSubscription('member-1', {
      action: 'adjustExpiry', expiresAt: '2026-12-31T00:00:00Z',
    }, actor, new Date('2026-08-21T00:00:00Z'));
    await data.updateSubscription('member-1', { action: 'lifetime' }, actor, new Date('2026-08-21T00:00:00Z'));
    expect(rpc).toHaveBeenNthCalledWith(1, 'rpc/admin_update_subscription', expect.objectContaining({ body: expect.stringContaining('"p_expires_at":"2026-12-31T00:00:00.000Z"') }));
    expect(rpc).toHaveBeenNthCalledWith(2, 'rpc/admin_update_subscription', expect.objectContaining({ body: expect.stringContaining('"p_action":"lifetime"') }));
  });

  it('confirms a transfer request through one transactional RPC', async () => {
    const rpc = vi.fn(async () => ({ id: 'transfer-1', status: 'confirmed' }));
    const data = createAdminData({ insertRows: vi.fn(), selectRows: vi.fn(), updateRows: vi.fn(), deleteRows: vi.fn(), supabaseRequest: rpc });

    await data.reviewTransferRequest('transfer-1', 'confirmed', actor, new Date('2026-08-21T00:00:00Z'));
    expect(rpc).toHaveBeenCalledWith('rpc/admin_review_transfer_request', expect.objectContaining({
      body: expect.stringContaining('"p_decision":"confirmed"'),
    }));
  });

  it('rejects a transfer request without creating a payment', async () => {
    const rpc = vi.fn(async () => ({ id: 'transfer-1', status: 'rejected' }));
    const data = createAdminData({
      insertRows: vi.fn(), selectRows: vi.fn(), updateRows: vi.fn(), deleteRows: vi.fn(), supabaseRequest: rpc,
    });

    await data.reviewTransferRequest('transfer-1', 'rejected', actor, new Date('2026-08-21T00:00:00Z'));
    expect(rpc).toHaveBeenCalledWith('rpc/admin_review_transfer_request', expect.objectContaining({ body: expect.stringContaining('"p_decision":"rejected"') }));
  });
});
