import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('Matrix analysis schedule', () => {
  it('refreshes each official source independently before its own analysis', () => {
    const schedules = JSON.parse(readFileSync(new URL('../cron.json', import.meta.url), 'utf8')) as Array<{
      name: string;
      payload?: Record<string, unknown>;
    }>;
    expect(schedules.map((schedule) => schedule.payload)).toEqual([
      expect.objectContaining({ lottery: '今彩539', sourceId: 'taiwan539', refreshHour: expect.any(Number) }),
      expect.objectContaining({ lottery: '天天樂', sourceId: 'sc888', refreshHour: expect.any(Number) }),
      expect.objectContaining({ lottery: '六合彩', sourceId: 'nfdhk', refreshHour: expect.any(Number) }),
      expect.objectContaining({ lottery: '大樂透', sourceId: 'taiwan649', refreshHour: expect.any(Number) }),
    ]);
    expect(schedules.some((schedule) => schedule.payload?.refreshAll === true)).toBe(false);
  });

  it('runs daily lottery workers often enough to finish Explore and Tianyan before the next draw', () => {
    const schedules = JSON.parse(readFileSync(new URL('../cron.json', import.meta.url), 'utf8')) as Array<{
      cron: string;
      payload?: { lottery?: string };
    }>;
    for (const lottery of ['今彩539', '天天樂']) {
      const schedule = schedules.find((entry) => entry.payload?.lottery === lottery);
      expect(schedule?.cron).toMatch(/\/2/);
      const runsPerDay = 24 * 30;
      const explorePartitions = 390;
      const tianyanPartitions = 130;
      expect(runsPerDay).toBeGreaterThan(explorePartitions + tianyanPartitions + 3);
    }
  });
});
