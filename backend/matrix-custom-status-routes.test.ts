import { describe, expect, it, vi } from 'vitest';
import { createMatrixCustomStatusRoutes } from './matrix-custom-status-routes';
import type { MemberContext } from './matrix-entitlements';
import type { CustomStatusConfig } from './matrix-custom-status';

const saved: CustomStatusConfig = {
  lottery: '今彩539', status: 'ACTIVE', explorePeriods: 13, exploreRange: '完整範圍',
  oneCodeGroups: [{ id: 'one', rows: [{ consecutive: '準4進5', roadType: '加減', numberOrder: '依號碼由小到大排序', sameCodeQuantity: 2 }] }],
  twoCodeGroups: [],
};

function member(plan: MemberContext['plan'] = 'monthly', active = true): MemberContext {
  return { authUserId: 'user-1', memberId: 'member-1', plan, active, referralSuccessCount: 0 };
}

function routes(context = member()) {
  const store = { list: vi.fn(async () => [saved]), save: vi.fn(async (_memberId, value) => value), reset: vi.fn(async () => undefined) };
  return {
    store,
    routes: createMatrixCustomStatusRoutes({ requireMember: async () => context, store, now: () => new Date('2026-08-21T00:00:00Z') }),
  };
}

describe('Matrix custom status routes', () => {
  it('lists preserved settings and their current application mode', async () => {
    const { routes: api } = routes(member('monthly'));
    await expect(api.list({ authorization: 'Bearer token', body: {} })).resolves.toMatchObject({
      status: 200,
      body: { items: [{ config: saved, evaluation: { mode: 'custom' } }] },
    });
  });

  it('lets monthly-or-above members save and replaces only the selected slot', async () => {
    const { routes: api, store } = routes(member('monthly'));
    await expect(api.save({ authorization: 'Bearer token', body: saved })).resolves.toMatchObject({ status: 200, body: { item: saved } });
    expect(store.save).toHaveBeenCalledWith('member-1', saved);
  });

  it('rejects custom saves for free, trial and expired members', async () => {
    for (const context of [member('free', false), member('trial'), member('monthly', false)]) {
      await expect(routes(context).routes.save({ authorization: 'Bearer token', body: saved })).resolves.toMatchObject({ status: 403, body: { error: { code: 'FORBIDDEN' } } });
    }
  });

  it('rejects composite saves below quarterly and accepts quarterly', async () => {
    const composite = { ...saved, oneCodeGroups: [{ id: 'c', rows: [{ ...saved.oneCodeGroups[0].rows[0], roadType: '複合' as const }] }] };
    await expect(routes(member('monthly')).routes.save({ authorization: 'Bearer token', body: composite })).resolves.toMatchObject({ status: 400, body: { error: { code: 'COMPOSITE_NOT_ENTITLED' } } });
    await expect(routes(member('quarterly')).routes.save({ authorization: 'Bearer token', body: composite })).resolves.toMatchObject({ status: 200 });
  });

  it('resets exactly one selected slot to Chapter 15', async () => {
    const { routes: api, store } = routes();
    await expect(api.reset({ authorization: 'Bearer token', body: { lottery: '今彩539', status: 'ACTIVE' } })).resolves.toEqual({ status: 200, body: { reset: true } });
    expect(store.reset).toHaveBeenCalledWith('member-1', '今彩539', 'ACTIVE');
  });
});
