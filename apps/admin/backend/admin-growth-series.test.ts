import { describe, expect, it, vi } from 'vitest';
import { getDashboard } from './admin-data';

type Row = Record<string, unknown>;

const fixtureRequest = (respond: (path: string) => Promise<unknown>) => vi.fn(async (path: string) => {
  const data = await respond(path);
  if (!Array.isArray(data)) return data;
  const query = new URL(path, 'https://example.test').searchParams;
  const offset = Number(query.get('offset') ?? 0);
  const limit = Number(query.get('limit') ?? 1000);
  return data.slice(offset, offset + limit);
});

describe('admin dashboard growth series', () => {
  it('returns cumulative member and confirmed-revenue series grouped by Asia/Taipei business date', async () => {
    const resetAt = '2026-09-01T16:15:00.000Z';
    const members: Row[] = [
      { registered_at: '2026-09-01T15:00:00.000Z', plan_expires_at: null, status: 'active', current_plan: null },
      { registered_at: '2026-09-01T16:00:00.000Z', plan_expires_at: null, status: 'active', current_plan: null },
      { registered_at: '2026-09-01T20:00:00.000Z', plan_expires_at: null, status: 'active', current_plan: null },
    ];
    const payments: Row[] = [
      { id: 'before-reset', amount: 999, paid_at: '2026-09-01T16:00:00.000Z', status: 'confirmed' },
      { id: 'first', amount: 100, paid_at: '2026-09-01T16:30:00.000Z', status: 'confirmed' },
      { id: 'second', amount: 50, paid_at: '2026-09-01T20:00:00.000Z', status: 'confirmed' },
      { id: 'third', amount: 25, paid_at: '2026-09-02T16:00:00.000Z', status: 'confirmed' },
      { id: 'pending', amount: 800, paid_at: '2026-09-02T16:00:00.000Z', status: 'pending' },
    ];
    const request = fixtureRequest(async (path) => {
      if (path.includes('/admin_revenue_settings?')) return [{ reset_at: resetAt }];
      if (path.includes('/members?')) return members;
      if (path.includes('/payments?')) return payments;
      if (path.includes('/rpc/admin_visitor_stats')) return { todayVisitors: 0, monthVisitors: 0, totalVisitors: 0 };
      return [];
    });

    const result = await getDashboard({ request }, new Date('2026-09-03T01:00:00.000Z'));

    expect(result.userGrowth).toEqual([
      { date: '2026-09-01', value: 1 },
      { date: '2026-09-02', value: 3 },
    ]);
    expect(result.revenueGrowth).toEqual([
      { date: '2026-09-02', value: 150 },
      { date: '2026-09-03', value: 175 },
    ]);
    expect(result.totalUsers).toBe(3);
    expect(result.cumulativeRevenue).toBe(175);
  });

  it('returns empty growth series when no dated members or eligible payments exist', async () => {
    const request = fixtureRequest(async (path) => {
      if (path.includes('/members?')) return [{ registered_at: null, plan_expires_at: null, status: 'active', current_plan: null }];
      if (path.includes('/rpc/admin_visitor_stats')) return { todayVisitors: 0, monthVisitors: 0, totalVisitors: 0 };
      return [];
    });

    const result = await getDashboard({ request }, new Date('2026-09-03T01:00:00.000Z'));

    expect(result.userGrowth).toEqual([]);
    expect(result.revenueGrowth).toEqual([]);
    expect(result.totalUsers).toBe(1);
    expect(result.cumulativeRevenue).toBe(0);
  });
});
