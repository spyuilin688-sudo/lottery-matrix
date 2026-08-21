import { describe, expect, it } from 'vitest';
import { runTiangongAcceptanceCases } from './matrix-tiangong-cases';

describe('Tiangong acceptance matrix', () => {
  it('passes every approved synthetic case through the real engine', () => {
    const cases = runTiangongAcceptanceCases();
    expect(cases.map(({ name, actual }) => [name, actual])).toEqual([
      ['五十期一段式固定加減上界', { valid: true, interval: 24, position: 2, prediction: '11', road: '加減版路' }],
      ['八十期二段式遞增加減合值', { valid: true, interval: 20, position: 5, prediction: '15', road: '加減＋合值' }],
      ['遞減球位加零歸拖牌', { valid: true, interval: 1, position: 3, prediction: '39', road: '拖牌版路' }],
      ['今彩539標準化', '01'],
      ['天天樂標準化', '01'],
      ['六合彩標準化', '01'],
      ['大樂透標準化', '01'],
      ['預測結果未落在未來期', 'PREDICTION_NOT_FUTURE'],
      ['完全相同結果去重', 1],
      ['相同預測不同版路身分保留', 2],
    ]);
    expect(cases.every(({ pass }) => pass)).toBe(true);
  });
});
