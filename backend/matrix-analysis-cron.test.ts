import { describe, expect, it } from 'vitest';
import { selectAnalysisLottery } from './matrix-analysis-cron';

describe('selectAnalysisLottery', () => {
  it('rotates one lottery per minute so every lottery resumes within four minutes', () => {
    expect(selectAnalysisLottery('2026-08-21T09:00:00.000Z')).toBe('今彩539');
    expect(selectAnalysisLottery('2026-08-21T09:01:00.000Z')).toBe('天天樂');
    expect(selectAnalysisLottery('2026-08-21T09:02:00.000Z')).toBe('六合彩');
    expect(selectAnalysisLottery('2026-08-21T09:03:00.000Z')).toBe('大樂透');
    expect(selectAnalysisLottery('2026-08-21T09:04:00.000Z')).toBe('今彩539');
  });
});
