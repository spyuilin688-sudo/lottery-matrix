import { describe, expect, it } from 'vitest';
import { isTaipeiRefreshWindow, selectAnalysisLottery } from './matrix-analysis-cron';

describe('selectAnalysisLottery', () => {
  it('rotates one fallback lottery per AppDeploy five-minute slot', () => {
    expect(selectAnalysisLottery('2026-08-21T09:00:00.000Z')).toBe('今彩539');
    expect(selectAnalysisLottery('2026-08-21T09:05:00.000Z')).toBe('天天樂');
    expect(selectAnalysisLottery('2026-08-21T09:10:00.000Z')).toBe('六合彩');
    expect(selectAnalysisLottery('2026-08-21T09:15:00.000Z')).toBe('大樂透');
    expect(selectAnalysisLottery('2026-08-21T09:20:00.000Z')).toBe('今彩539');
  });

  it('recognizes the existing Taipei source-refresh window without changing its hours', () => {
    expect(isTaipeiRefreshWindow('2026-08-21T10:34:00.000Z', 18)).toBe(false);
    expect(isTaipeiRefreshWindow('2026-08-21T10:35:00.000Z', 18)).toBe(true);
    expect(isTaipeiRefreshWindow('2026-08-21T10:59:00.000Z', 18)).toBe(true);
    expect(isTaipeiRefreshWindow('2026-08-21T11:00:00.000Z', 18)).toBe(false);
  });
});
