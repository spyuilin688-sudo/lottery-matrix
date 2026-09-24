import { describe, expect, it, vi } from 'vitest';

import {
  createMatrixStatusCompactReader,
  createMatrixPublicResultRevisionReader,
  createMatrixStatusIdentityReader,
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

  it('reads compact status without requesting raw Explore/Tianyan sources', async () => {
    const payload = {
      analysisVersion: 'v1', drawPeriod: '115000210', payload: { cards: [] },
    };
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(payload), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));
    const read = createMatrixStatusCompactReader(() => config, fetcher);

    await expect(read('今彩539', '115000210')).resolves.toEqual(payload);
    expect(fetcher).toHaveBeenCalledWith(
      'https://project.supabase.co/rest/v1/rpc/matrix_status_compact_get',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          apikey: 'service-role-key',
          Authorization: 'Bearer service-role-key',
        }),
        body: JSON.stringify({
          p_request: { lottery: '今彩539', drawPeriod: '115000210' },
        }),
      }),
    );
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

it('reads public result revisions with the service credential', async () => {
  const revision = Object.fromEntries(['今彩539', '天天樂', '六合彩', '大樂透'].map((lottery) => [lottery, {
    drawRevision: 'revision-a', generation: 1, activeVersions: {},
  }]));
  const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(revision), { status: 200 }));
  await expect(createMatrixPublicResultRevisionReader(() => config, fetcher)()).resolves.toEqual(revision);
  expect(fetcher).toHaveBeenCalledWith(
    'https://project.supabase.co/rest/v1/rpc/matrix_public_result_revision',
    expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({ Authorization: 'Bearer service-role-key' }),
      body: '{}',
    }),
  );
});


it('requests DB summary projection and uses the existing lightweight identity RPC for cache validation', async () => {
  const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({ analysisVersion: 'v1', drawPeriod: '115000210' })));
  await createMatrixStatusCompactReader(() => config, fetcher)('今彩539', undefined, true);
  expect(JSON.parse(String(fetcher.mock.calls[0][1]?.body))).toEqual({ p_request: { lottery: '今彩539', summaryOnly: true } });
  await createMatrixStatusIdentityReader(() => config, fetcher)('今彩539');
  expect(fetcher.mock.calls[1][0]).toBe('https://project.supabase.co/rest/v1/rpc/matrix_status_identity_get');
});
