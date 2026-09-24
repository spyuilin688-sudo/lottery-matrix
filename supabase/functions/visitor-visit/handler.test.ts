import { describe, expect, it, vi } from 'vitest';
import { createVisitorVisitHandler } from './handler';

const endpoint = 'https://project.supabase.co/functions/v1/visitor-visit';

function request(options: { method?: string; origin?: string; ip?: string; userAgent?: string; withStats?: boolean } = {}) {
  return new Request(`${endpoint}${options.withStats ? '?stats=1' : ''}`, {
    method: options.method ?? 'POST',
    headers: {
      Origin: options.origin ?? 'https://matrixlottery.idv.tw',
      'X-Forwarded-For': options.ip ?? '203.0.113.7',
      'User-Agent': options.userAgent ?? 'Matrix PWA',
    },
  });
}

describe('visitor visit handler', () => {
  it('derives the source at the server boundary and ignores caller-controlled identity data', async () => {
    const recordVisit = vi.fn().mockResolvedValue(undefined);
    const handler = createVisitorVisitHandler({ recordVisit });

    const response = await handler(request());

    expect(response.status).toBe(204);
    expect(recordVisit).toHaveBeenCalledWith('203.0.113.7');
  });

  it('rejects unapproved origins before writing', async () => {
    const recordVisit = vi.fn();
    const handler = createVisitorVisitHandler({ recordVisit });

    const response = await handler(request({ origin: 'https://attacker.example' }));

    expect(response.status).toBe(403);
    expect(recordVisit).not.toHaveBeenCalled();
  });

  it('supports CORS preflight without recording a visit', async () => {
    const recordVisit = vi.fn();
    const handler = createVisitorVisitHandler({ recordVisit });

    const response = await handler(request({ method: 'OPTIONS' }));

    expect(response.status).toBe(204);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://matrixlottery.idv.tw');
    expect(recordVisit).not.toHaveBeenCalled();
  });

  it('fails closed when the gateway does not provide an IP address', async () => {
    const recordVisit = vi.fn();
    const handler = createVisitorVisitHandler({ recordVisit });
    const missingIp = new Request(endpoint, {
      method: 'POST',
      headers: { Origin: 'https://matrixlottery.idv.tw', 'User-Agent': 'Matrix PWA' },
    });

    const response = await handler(missingIp);

    expect(response.status).toBe(400);
    expect(recordVisit).not.toHaveBeenCalled();
  });

  it('records intro visits separately from the main site before returning intro-only counts', async () => {
    const calls: string[] = [];
    const recordVisit = vi.fn();
    const recordIntroVisit = vi.fn(async () => { calls.push('intro-visit'); });
    const readIntroStats = vi.fn(async () => {
      calls.push('intro-stats');
      return { todayVisitors: 1, totalVisitors: 1 };
    });
    const handler = createVisitorVisitHandler({ recordVisit, recordIntroVisit, readIntroStats });

    const response = await handler(request({ withStats: true }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ todayVisitors: 1, totalVisitors: 1 });
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(calls).toEqual(['intro-visit', 'intro-stats']);
    expect(recordVisit).not.toHaveBeenCalled();
  });

  it('uses the gateway address for the intro count when forwarded headers disagree', async () => {
    const recordVisit = vi.fn();
    const recordIntroVisit = vi.fn().mockResolvedValue(undefined);
    const readIntroStats = vi.fn().mockResolvedValue({ todayVisitors: 1, totalVisitors: 1 });
    const handler = createVisitorVisitHandler({ recordVisit, recordIntroVisit, readIntroStats });
    const response = await handler(new Request(`${endpoint}?stats=1`, {
      method: 'POST',
      headers: {
        Origin: 'https://matrixlottery.idv.tw',
        'X-Forwarded-For': '203.0.113.7',
        'CF-Connecting-IP': '198.51.100.8',
      },
    }));

    expect(response.status).toBe(200);
    expect(recordIntroVisit).toHaveBeenCalledWith('198.51.100.8');
    expect(recordVisit).not.toHaveBeenCalled();
  });

  it('keeps normal PWA visits write-only and never records an intro visit', async () => {
    const recordVisit = vi.fn().mockResolvedValue(undefined);
    const recordIntroVisit = vi.fn();
    const readIntroStats = vi.fn();
    const handler = createVisitorVisitHandler({ recordVisit, recordIntroVisit, readIntroStats });

    const response = await handler(request());

    expect(response.status).toBe(204);
    expect(recordVisit).toHaveBeenCalledOnce();
    expect(recordIntroVisit).not.toHaveBeenCalled();
    expect(readIntroStats).not.toHaveBeenCalled();
  });

  it('does not expose counts to other origins', async () => {
    const recordVisit = vi.fn();
    const recordIntroVisit = vi.fn();
    const readIntroStats = vi.fn();
    const handler = createVisitorVisitHandler({ recordVisit, recordIntroVisit, readIntroStats });

    const response = await handler(request({ origin: 'https://untrusted.example', withStats: true }));

    expect(response.status).toBe(403);
    expect(recordVisit).not.toHaveBeenCalled();
    expect(recordIntroVisit).not.toHaveBeenCalled();
    expect(readIntroStats).not.toHaveBeenCalled();
  });

  it('returns an unavailable state when reading the aggregate fails', async () => {
    const recordVisit = vi.fn().mockResolvedValue(undefined);
    const recordIntroVisit = vi.fn().mockResolvedValue(undefined);
    const readIntroStats = vi.fn().mockRejectedValue(new Error('database unavailable'));
    const handler = createVisitorVisitHandler({ recordVisit, recordIntroVisit, readIntroStats });

    const response = await handler(request({ withStats: true }));

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: { code: 'VISITOR_STATS_UNAVAILABLE' } });
  });
});
