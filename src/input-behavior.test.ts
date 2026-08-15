import { describe, expect, it } from 'vitest';
import { formatLotteryNumber, normalizeLotteryNumberDraft } from './input-behavior';

describe('全專案輸入框行為', () => {
  it('號碼輸入只保留 01 到 49 範圍內的值', () => {
    expect(normalizeLotteryNumberDraft('49', '')).toBe('49');
    expect(normalizeLotteryNumberDraft('50', '5')).toBe('5');
    expect(normalizeLotteryNumberDraft('abc12', '')).toBe('12');
    expect(normalizeLotteryNumberDraft('00', '')).toBe('');
  });

  it('一位數號碼輸入完成後自動補零', () => {
    expect(formatLotteryNumber('1')).toBe('01');
    expect(formatLotteryNumber('9')).toBe('09');
    expect(formatLotteryNumber('10')).toBe('10');
    expect(formatLotteryNumber('49')).toBe('49');
  });
});
