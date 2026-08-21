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
});
