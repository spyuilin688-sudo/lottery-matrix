import { expect, it, vi } from 'vitest';
import { createMatrixStatusEdgeHandler } from '../supabase/functions/matrix-status/handler';

function dependencies() {
  const recomputeMember = vi.fn(async (memberId: string, lottery: string) => ({
    memberId, lottery, updated: true,
  }));
  const recomputeLottery = vi.fn(async (lottery: string) => ({ lottery, updated: 2 }));
  return {
    recomputeMember,
    recomputeLottery,
    value: {
      requireMember: async () => { throw new Error('member auth must not run'); },
      readStatusSources: async () => null,
      listConfigs: async () => [],
      authorizeInternal: (authorization?: string) => authorization === 'Bearer service-secret',
      recomputeMember,
      recomputeLottery,
    },
  };
}

it('rejects recompute with a normal bearer token', async () => {
  const deps = dependencies();
  const handler = createMatrixStatusEdgeHandler(deps.value);
  const response = await handler(new Request('https://example.test/functions/v1/matrix-status', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer member-token',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ action: 'recompute', lottery: '今彩539' }),
  }));

  expect(response.status).toBe(403);
  await expect(response.json()).resolves.toEqual({ error: { code: 'FORBIDDEN' } });
  expect(deps.recomputeMember).not.toHaveBeenCalled();
  expect(deps.recomputeLottery).not.toHaveBeenCalled();
});

it('allows service-role batch recompute for one lottery', async () => {
  const deps = dependencies();
  const handler = createMatrixStatusEdgeHandler(deps.value);
  const response = await handler(new Request('https://example.test/functions/v1/matrix-status', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer service-secret',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ action: 'recompute', lottery: '六合彩' }),
  }));

  expect(response.status).toBe(200);
  await expect(response.json()).resolves.toEqual({ result: { lottery: '六合彩', updated: 2 } });
  expect(deps.recomputeLottery).toHaveBeenCalledWith('六合彩');
  expect(deps.recomputeMember).not.toHaveBeenCalled();
});

it('allows service-role recompute for one member only', async () => {
  const deps = dependencies();
  const handler = createMatrixStatusEdgeHandler(deps.value);
  const response = await handler(new Request('https://example.test/functions/v1/matrix-status', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer service-secret',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ action: 'recompute', lottery: '大樂透', memberId: 'member-a' }),
  }));

  expect(response.status).toBe(200);
  await expect(response.json()).resolves.toEqual({
    result: { memberId: 'member-a', lottery: '大樂透', updated: true },
  });
  expect(deps.recomputeMember).toHaveBeenCalledWith('member-a', '大樂透');
  expect(deps.recomputeLottery).not.toHaveBeenCalled();
});
