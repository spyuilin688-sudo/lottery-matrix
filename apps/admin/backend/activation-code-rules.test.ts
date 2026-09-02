import { describe, expect, it, vi } from 'vitest';
import { createAdminData } from './admin-data';

const superAdmin = { id: 'super-1', account: 'super@example.com', name: 'Super', role: '超級管理員' };
const operator = { id: 'operator-1', account: 'operator@example.com', name: 'Operator', role: '營運管理員' };
const viewer = { id: 'viewer-1', account: 'viewer@example.com', name: 'Viewer', role: '查看人員' };

const rows = (quantity: number) => Array.from({ length: quantity }, (_, index) => ({ id: String(index + 1), batch_id: 'batch-1' }));
const createData = (rpc: ReturnType<typeof vi.fn>) => createAdminData({
  supabaseRequest: rpc,
  insertRows: vi.fn(async () => [{ id: 'audit-1' }]),
  selectRows: vi.fn(async () => []),
  updateRows: vi.fn(async () => []),
  deleteRows: vi.fn(async () => []),
});

describe('activation-code generation rules', () => {
  it('allows a super administrator to create the new 60-day duration with an approved quantity', async () => {
    const rpc = vi.fn(async () => rows(20));
    const data = createData(rpc);

    await expect(data.generateActivationCodeBatch('60_days', 20, superAdmin)).resolves.toEqual({ batchId: 'batch-1', count: 20 });
    expect(rpc).toHaveBeenCalledWith('rpc/generate_activation_code_batch', {
      method: 'POST',
      body: JSON.stringify({ p_duration_type: '60_days', p_quantity: 20 }),
    });
  });

  it.each(['7_days', '15_days'])('allows an operations administrator to create %s codes', async (durationType) => {
    const rpc = vi.fn(async () => rows(3));
    const data = createData(rpc);

    await expect(data.generateActivationCodeBatch(durationType, 3, operator)).resolves.toEqual({ batchId: 'batch-1', count: 3 });
  });

  it.each(['30_days', '60_days', '90_days', '365_days', 'lifetime'])('blocks an operations administrator from creating %s codes', async (durationType) => {
    const rpc = vi.fn(async () => rows(1));
    const data = createData(rpc);

    await expect(data.generateActivationCodeBatch(durationType, 1, operator)).rejects.toMatchObject({ statusCode: 403 });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('blocks a view-only administrator from creating activation codes', async () => {
    const rpc = vi.fn(async () => rows(1));
    const data = createData(rpc);

    await expect(data.generateActivationCodeBatch('7_days', 1, viewer)).rejects.toMatchObject({ statusCode: 403 });
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each([0, 2, 4, 6, 21])('rejects unsupported quantity %i before calling Supabase', async (quantity) => {
    const rpc = vi.fn(async () => rows(quantity));
    const data = createData(rpc);

    await expect(data.generateActivationCodeBatch('7_days', quantity, operator)).rejects.toMatchObject({ statusCode: 400 });
    expect(rpc).not.toHaveBeenCalled();
  });
});
