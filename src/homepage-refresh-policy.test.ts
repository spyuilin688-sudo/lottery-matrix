import { describe, expect, it } from 'vitest';
import {
  HOME_REFRESH_INTERVAL_MS,
  homepageRefreshCycleAt,
  homepageRefreshCycleKey,
  millisecondsUntilNextHomepageRefreshWindow,
} from './homepage-refresh-policy';

describe('homepage refresh policy', () => {
  it('uses the requested Fantasy5 09:30-13:00 Taipei window', () => {
    expect(homepageRefreshCycleAt(new Date('2026-09-23T01:29:59Z'))).toBeNull();
    expect(homepageRefreshCycleAt(new Date('2026-09-23T01:30:00Z'))).toMatchObject({
      group: 'fantasy5',
      cycleDate: '2026-09-23',
      lotteries: ['天天樂'],
    });
    expect(homepageRefreshCycleAt(new Date('2026-09-23T05:00:00Z'))).toMatchObject({
      group: 'fantasy5',
      cycleDate: '2026-09-23',
    });
    expect(homepageRefreshCycleAt(new Date('2026-09-23T05:01:00Z'))).toBeNull();
  });

  it('keeps the 20:30-01:00 evening window in one cycle across midnight', () => {
    const start = homepageRefreshCycleAt(new Date('2026-09-23T12:30:00Z'));
    expect(start).toMatchObject({
      group: 'evening',
      cycleDate: '2026-09-23',
      lotteries: ['今彩539', '大樂透', '六合彩'],
    });
    expect(start && homepageRefreshCycleKey(start)).toBe('evening:2026-09-23');

    expect(homepageRefreshCycleAt(new Date('2026-09-23T17:00:00Z'))).toMatchObject({
      group: 'evening',
      cycleDate: '2026-09-23',
    });
    expect(homepageRefreshCycleAt(new Date('2026-09-23T17:01:00Z'))).toBeNull();
  });

  it('keeps one ten-minute fallback only while a refresh window remains pending', () => {
    expect(HOME_REFRESH_INTERVAL_MS).toBe(600_000);
    expect(millisecondsUntilNextHomepageRefreshWindow(new Date('2026-09-23T00:00:00Z'))).toBe(90 * 60_000);
    expect(millisecondsUntilNextHomepageRefreshWindow(new Date('2026-09-23T06:00:00Z'))).toBe(390 * 60_000);
    expect(millisecondsUntilNextHomepageRefreshWindow(new Date('2026-09-23T13:00:00Z'))).toBe(12.5 * 60 * 60_000);
  });
});
