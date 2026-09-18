import { describe, expect, it, vi } from 'vitest';
import { createVisitorVisitHandler } from './handler';

const endpoint = 'https://project.supabase.co/functions/v1/visitor-visit';

function request(options: { method?: string; origin?: string; ip?: string; userAgent?: string } = {}) {
  return new Request(endpoint, {
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
});
