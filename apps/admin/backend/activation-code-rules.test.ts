import { describe, expect, it, vi } from 'vitest';
import { createAdminData } from './admin-data';

const superAdmin = { id: 'super-1', account: 'super@example.com', name: 'Super', role: '超級管理員' };
const operator = { id: 'operator-1', account: 'operator@example.com', name: 'Operator', role: '營運管理員' };
const viewer = { id: 'viewer-1', account: 'viewer@example.com', name: 'Viewer', role: '查看人員' };
const requestId = '00000000-0000-4000-8000-000000000010';

const result = (quantity: number) => ({ batchId: 'batch-1', count: quantity });
const createData = (rpc: ReturnType<typeof vi.fn>) => createAdminData({
  supabaseRequest: rpc,
  insertRows: vi.fn(async () => [{ id: 'audit-1' }]),
  selectRows: vi.fn(async () => []),
  updateRows: vi.fn(async () => []),
  deleteRows: vi.fn(async () => []),
});

describe('activation-code generation rules', () => {
  it('allows a super administrator to create the new 60-day duration with an approved quantity', async () => {
    const rpc = vi.fn(async () => result(20));
    const data = createData(rpc);

    await expect(data.generateActivationCodeBatch('60_days', 20, superAdmin, requestId)).resolves.toEqual({ batchId: 'batch-1', count: 20 });
    expect(rpc).toHaveBeenCalledWith('rpc/admin_generate_activation_code_batch', {
      method: 'POST',
      body: JSON.stringify({ p_duration_type: '60_days', p_quantity: 20, p_actor_id: superAdmin.id, p_request_id: requestId }),
    });
  });

  it.each(['7_days', '15_days'])('allows an operations administrator to create %s codes', async (durationType) => {
    const rpc = vi.fn(async () => result(3));
    const data = createData(rpc);

    await expect(data.generateActivationCodeBatch(durationType, 3, operator, requestId)).resolves.toEqual({ batchId: 'batch-1', count: 3 });
  });

  it.each(['30_days', '60_days', '90_days', '365_days', 'lifetime'])('blocks an operations administrator from creating %s codes', async (durationType) => {
    const rpc = vi.fn(async () => result(1));
    const data = createData(rpc);

    await expect(data.generateActivationCodeBatch(durationType, 1, operator)).rejects.toMatchObject({ statusCode: 403 });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('blocks a view-only administrator from creating activation codes', async () => {
    const rpc = vi.fn(async () => result(1));
    const data = createData(rpc);

    await expect(data.generateActivationCodeBatch('7_days', 1, viewer)).rejects.toMatchObject({ statusCode: 403 });
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each([0, 2, 4, 6, 21])('rejects unsupported quantity %i before calling Supabase', async (quantity) => {
    const rpc = vi.fn(async () => result(quantity));
    const data = createData(rpc);

    await expect(data.generateActivationCodeBatch('7_days', quantity, operator)).rejects.toMatchObject({ statusCode: 400 });
    expect(rpc).not.toHaveBeenCalled();
  });
});
