import { describe, expect, it, vi } from 'vitest';

import {
  createMatrixStatusSourceReader,
  createMatrixStatusValidationReader,
} from '../supabase/functions/matrix-status/source-reader';

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

  it('reads status validation through the service-role-only source function', async () => {
    const payload = { itemId: 'road-2', validation: { itemId: 'road-2', ruleSets: [] } };
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(payload), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));
    const read = createMatrixStatusValidationReader(() => config, fetcher);

    await expect(read('今彩539', '115000210', 'v1', 'road-2')).resolves.toEqual(payload);
    expect(fetcher).toHaveBeenCalledWith(
      'https://project.supabase.co/rest/v1/rpc/matrix_status_validation_source_get',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          apikey: 'service-role-key',
          Authorization: 'Bearer service-role-key',
        }),
        body: JSON.stringify({
          p_request: {
            lottery: '今彩539', drawPeriod: '115000210', analysisVersion: 'v1', itemId: 'road-2',
          },
        }),
      }),
    );
  });
});
