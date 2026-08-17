// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchLatestLotteryDraw, fetchNumberReference, fetchTongXing } from '../lottery-api';

afterEach(() => {
  vi.restoreAllMocks();
});

function mockJsonResponse(body: unknown) {
  vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }),
  );
}

describe('lottery-api response validation', () => {
  it('同星回傳缺少 groups 時拒絕異常格式', async () => {
    mockJsonResponse({
      lottery: '今彩539',
      numberOrder: '依號碼由小到大排序',
      numbers: ['01', '02'],
      futureOffset: 1,
    });

    await expect(
      fetchTongXing({
        lottery: '今彩539',
        numberOrder: '依號碼由小到大排序',
        numbers: ['01', '02'],
        futureOffset: 1,
      }),
    ).rejects.toThrow('Lottery API invalid response: groups');
  });

  it('號碼對照單回傳缺少 items 時拒絕異常格式', async () => {
    mockJsonResponse({
      lottery: '今彩539',
      numberOrder: '依號碼由小到大排序',
      historyRange: 1000,
      numbers: ['01', '02'],
    });

    await expect(
      fetchNumberReference({
        lottery: '今彩539',
        numberOrder: '依號碼由小到大排序',
        historyRange: 1000,
        numbers: ['01', '02'],
      }),
    ).rejects.toThrow('Lottery API invalid response: items');
  });

  it('六合彩最新開獎的獨立特別號會併入第七顆', async () => {
    mockJsonResponse({
      period: '5896',
      drawDate: '2026/08/11',
      numbers: ['21', '18', '07', '44', '13', '38'],
      specialNumber: '03',
    });

    const result = await fetchLatestLotteryDraw('六合彩');

    expect(result?.numbers).toEqual(['07', '13', '18', '21', '38', '44', '03']);
    expect(result?.sortedNumbers).toEqual(['07', '13', '18', '21', '38', '44', '03']);
    expect(result?.drawOrderNumbers).toEqual(['21', '18', '07', '44', '13', '38', '03']);
  });

  it('號碼對照單的獨立特別號會保留為第七顆', async () => {
    mockJsonResponse({
      lottery: '大樂透',
      numberOrder: '依實際開獎順序排序',
      historyRange: 1000,
      numbers: [],
      items: [{
        period: '115078',
        drawDate: '2026/08/11',
        numbers: ['21', '18', '07', '44', '13', '38'],
        specialNumber: '03',
        matchSlots: [],
      }],
    });

    const result = await fetchNumberReference({
      lottery: '大樂透',
      numberOrder: '依實際開獎順序排序',
      historyRange: 1000,
      numbers: [],
    });

    expect(result.items[0].numbers).toEqual(['21', '18', '07', '44', '13', '38', '03']);
  });
});
