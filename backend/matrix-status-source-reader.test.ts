import { describe, expect, it, vi } from 'vitest';

import { createMatrixStatusSourceReader } from '../supabase/functions/matrix-status/source-reader';

const config = {
  url: 'https://project.supabase.co',
  serviceRoleKey: 'service-role-key',
};

describe('Matrix status source reader', () => {
  it('turns the database ANALYSIS_NOT_READY signal into an empty source', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      code: 'P0001',
      message: 'ANALYSIS_NOT_READY',
    }), { status: 400, headers: { 'Content-Type': 'application/json' } }));
    const read = createMatrixStatusSourceReader(() => config, fetcher);

    await expect(read('今彩539')).resolves.toBeNull();
  });

  it('returns a completed source payload', async () => {
    const payload = {
      analysisVersion: 'v1', drawPeriod: '115000210', explore: { items: [] }, tianyan: { items: [] },
    };
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(payload), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));
    const read = createMatrixStatusSourceReader(() => config, fetcher);

    await expect(read('今彩539')).resolves.toEqual(payload);
  });

  it('keeps unexpected database failures opaque', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: 'private detail' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    }));
    const read = createMatrixStatusSourceReader(() => config, fetcher);

    await expect(read('今彩539')).rejects.toThrow('SUPABASE_ANALYSIS_READ_FAILED');
  });
});
