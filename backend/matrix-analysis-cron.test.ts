import { describe, expect, it } from 'vitest';
import { selectAnalysisLottery } from './matrix-analysis-cron';

describe('selectAnalysisLottery', () => {
  it('rotates one lottery per five-minute slot', () => {
    expect(selectAnalysisLottery('2026-08-21T09:00:00.000Z')).toBe('今彩539');
    expect(selectAnalysisLottery('2026-08-21T09:05:00.000Z')).toBe('天天樂');
    expect(selectAnalysisLottery('2026-08-21T09:10:00.000Z')).toBe('六合彩');
    expect(selectAnalysisLottery('2026-08-21T09:15:00.000Z')).toBe('大樂透');
    expect(selectAnalysisLottery('2026-08-21T09:20:00.000Z')).toBe('今彩539');
  });
});
