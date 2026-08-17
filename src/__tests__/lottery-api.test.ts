// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchNumberReference, fetchTongXing } from '../lottery-api';

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
});
