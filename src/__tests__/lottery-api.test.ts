// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LOTTERY_API_BASE, fetchLatestLotteryDraw, fetchLotteryHistory, fetchNumberReference, fetchTongXing, normalizePeriod } from '../lottery-api';
import { resetReadCacheForTests } from '../read-cache';

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  resetReadCacheForTests();
  localStorage.clear();
});

function mockJsonResponse(body: unknown) {
  vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }),
  );
}

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

describe('lottery-api response validation', () => {
  it('所有同類舊期數格式都正規化為六碼且不誤改正常值', () => {
    expect(normalizePeriod('今彩539', '96000024')).toBe('096024');
    expect(normalizePeriod('今彩539', '105000123')).toBe('105123');
    expect(normalizePeriod('大樂透', '97000456')).toBe('097456');
    expect(normalizePeriod('大樂透', '114000789')).toBe('114789');
    expect(normalizePeriod('今彩539', '096024')).toBe('096024');
    expect(normalizePeriod('今彩539', 'unexpected')).toBe('unexpected');
    expect(normalizePeriod('六合彩', '96000024')).toBe('96000024');
    expect(normalizePeriod('天天樂', '96000024')).toBe('96000024');
  });

  it('最新開獎缺少 numbers 時拒絕異常格式', async () => {
    mockJsonResponse({ period: '5899', drawDate: '2026/08/14' });
    await expect(fetchLatestLotteryDraw('今彩539')).rejects.toThrow('Lottery API invalid response: item');
  });

  it('歷史開獎 items 內缺少 numbers 時拒絕異常格式', async () => {
    const latest = { period: '115000207', numbers: ['01', '02', '03', '04', '05'] };
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse(latest))
      .mockResolvedValueOnce(jsonResponse({ items: [{ period: '5899', drawDate: '2026/08/14' }] }));
    await expect(fetchLotteryHistory('今彩539', 10)).rejects.toThrow('Lottery API invalid response: items[0]');
  });

  it('相同彩種與範圍的歷史資料在十五分鐘內共用讀取結果', async () => {
    const latest = { period: '115000207', numbers: ['01', '02', '03', '04', '05'] };
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse(latest))
      .mockResolvedValueOnce(jsonResponse({ items: [latest] }));

    await fetchLotteryHistory('今彩539', 1000);
    await fetchLotteryHistory('今彩539', 1000);

    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('最新期號在十五分鐘內跨重新初始化使用已儲存資料', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-31T14:00:00Z'));
    const latest = { period: '115000207', numbers: ['01', '02', '03', '04', '05'] };
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => jsonResponse(latest));

    await fetchLatestLotteryDraw('今彩539');
    resetReadCacheForTests();
    await fetchLatestLotteryDraw('今彩539');

    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('歷史資料在同一期號內跨重新初始化使用已儲存資料', async () => {
    const latest = { period: '115000207', numbers: ['01', '02', '03', '04', '05'] };
    const history = { items: [latest] };
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse(latest))
      .mockResolvedValueOnce(jsonResponse(history));

    await fetchLatestLotteryDraw('今彩539');
    await fetchLotteryHistory('今彩539', 1000);
    resetReadCacheForTests();
    await fetchLotteryHistory('今彩539', 1000);

    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('同星使用已保存的歷史資料在前端篩選', async () => {
    const request = {
      lottery: '今彩539' as const,
      numberOrder: '依號碼由小到大排序' as const,
      numbers: ['01', '02'],
      futureOffset: 1,
    };
    const history = {
      items: [
        { period: '115000208', numbers: ['06', '07', '08', '09', '10'] },
        { period: '115000207', numbers: ['01', '02', '03', '04', '05'] },
      ],
    };
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('/latest/')) return jsonResponse(history.items[1]);
      if (url.includes('/history/')) return jsonResponse(history);
      return jsonResponse({ ...request, groups: [] });
    });

    await expect(fetchTongXing(request)).resolves.toMatchObject({
      groups: [{ lockedEntry: { period: '115207' }, predictedEntry: { period: '115208' } }],
    });
    expect(fetchSpy.mock.calls.map(([url]) => String(url))).not.toContain(`${LOTTERY_API_BASE}/api/matrix/tongxing`);
  });

  it('號碼對照單使用已保存的歷史資料在前端篩選', async () => {
    const request = {
      lottery: '今彩539' as const,
      numberOrder: '依號碼由小到大排序' as const,
      historyRange: 1000 as const,
      numbers: ['01', '10'],
    };
    const history = {
      items: [
        { period: '115000208', numbers: ['06', '07', '08', '09', '10'] },
        { period: '115000207', numbers: ['01', '02', '03', '04', '05'] },
      ],
    };
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('/latest/')) return jsonResponse(history.items[0]);
      if (url.includes('/history/')) return jsonResponse(history);
      return jsonResponse({ ...request, items: [] });
    });

    await expect(fetchNumberReference(request)).resolves.toMatchObject({
      items: [
        { period: '115207', matchSlots: [1, 0, 0, 0, 0] },
        { period: '115208', matchSlots: [0, 0, 0, 0, 2] },
      ],
    });
    expect(fetchSpy.mock.calls.map(([url]) => String(url))).not.toContain(`${LOTTERY_API_BASE}/api/matrix/number-reference`);
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

  it('號碼對照單的獨立特別號會保留在全部號碼順序欄位', async () => {
    const draw = {
      period: '115078',
      drawDate: '2026/08/11',
      numbers: ['21', '18', '07', '44', '13', '38'],
      sortedNumbers: ['07', '13', '18', '21', '38', '44'],
      drawOrderNumbers: ['21', '18', '07', '44', '13', '38'],
      specialNumber: '03',
    };
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      return jsonResponse(String(input).includes('/latest/') ? draw : { items: [draw] });
    });

    const result = await fetchNumberReference({
      lottery: '大樂透',
      numberOrder: '依實際開獎順序排序',
      historyRange: 1000,
      numbers: [],
    });

    expect(result.items[0].numbers).toEqual(['21', '18', '07', '44', '13', '38', '03']);
    expect(result.items[0].sortedNumbers).toEqual(['07', '13', '18', '21', '38', '44', '03']);
    expect(result.items[0].drawOrderNumbers).toEqual(['21', '18', '07', '44', '13', '38', '03']);
  });

  it('最新開獎只保留 01 到 49 的有效號碼', async () => {
    mockJsonResponse({
      period: '5897',
      drawDate: '2026/08/12',
      numbers: ['', '00', '1', '49', '50', '7'],
    });

    const result = await fetchLatestLotteryDraw('今彩539');

    expect(result?.numbers).toEqual(['01', '07', '49']);
    expect(result?.drawOrderNumbers).toEqual(['01', '49', '07']);
  });

  it('六合彩不接受超出 01 到 49 的獨立特別號', async () => {
    mockJsonResponse({
      period: '5898',
      drawDate: '2026/08/13',
      numbers: ['01', '02', '03', '04', '05', '06'],
      specialNumber: '50',
    });

    const result = await fetchLatestLotteryDraw('六合彩');

    expect(result?.specialNumber).toBeUndefined();
    expect(result?.numbers).toEqual(['01', '02', '03', '04', '05', '06']);
    expect(result?.drawOrderNumbers).toEqual(['01', '02', '03', '04', '05', '06']);
  });
});
