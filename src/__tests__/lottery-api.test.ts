// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { API_REQUEST_TIMEOUT_MS } from '../lib/api-resilience';
import { LOTTERY_API_BASE, fetchLatestLotteryDraw, fetchLotteryHistory, fetchNumberReference, fetchTongXing, normalizePeriod } from '../lottery-api';
import { clearReadCache, readThroughCache, resetReadCacheForTests } from '../read-cache';

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
  it('adds one request id and retries a transient read response once', async () => {
    const draw = { period: '115000207', numbers: ['01', '02', '03', '04', '05'] };
    const fetcher = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(jsonResponse(draw));

    await expect(fetchLatestLotteryDraw('今彩539')).resolves.toMatchObject({ period: '115207' });

    expect(fetcher).toHaveBeenCalledTimes(2);
    const requestIds = fetcher.mock.calls.map(([, init]) => (
      new Headers(init?.headers).get('X-Request-ID')
    ));
    expect(requestIds[0]).toMatch(/^[0-9a-f-]{36}$/);
    expect(requestIds[1]).toBe(requestIds[0]);
  });

  it('stops a stalled Railway read at the shared deadline', async () => {
    vi.useFakeTimers();
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      async () => new Promise<Response>(() => undefined),
    );
    const result = fetchLatestLotteryDraw('今彩539');
    const rejection = expect(result).rejects.toMatchObject({
      code: 'REQUEST_TIMEOUT',
      message: 'REQUEST_TIMEOUT',
    });

    await vi.advanceTimersByTimeAsync(API_REQUEST_TIMEOUT_MS);

    await rejection;
  });

  it('keeps the shared deadline through Railway body delivery and cancels a stalled body', async () => {
    vi.useFakeTimers();
    const cancel = vi.fn();
    const fetcher = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(
      new ReadableStream<Uint8Array>({ cancel }),
      { headers: { 'content-type': 'application/json' } },
    ));
    let settled = false;
    let failure: unknown;

    void fetchLatestLotteryDraw('今彩539').then(
      () => { settled = true; },
      (error: unknown) => {
        settled = true;
        failure = error;
      },
    );
    await vi.advanceTimersByTimeAsync(API_REQUEST_TIMEOUT_MS - 1);
    expect(settled).toBe(false);

    await vi.advanceTimersByTimeAsync(1);

    expect(failure).toMatchObject({ code: 'REQUEST_TIMEOUT', message: 'REQUEST_TIMEOUT' });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not retry an unauthorized Railway read', async () => {
    const fetcher = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('private upstream body', { status: 401, statusText: 'private upstream message' }),
    );

    const failure = await fetchLatestLotteryDraw('今彩539').catch((error: unknown) => error);

    expect(String(failure)).not.toContain('private upstream');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

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

  it('相同彩種與範圍的歷史資料在五分鐘內共用讀取結果', async () => {
    const latest = { period: '115000207', numbers: ['01', '02', '03', '04', '05'] };
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse(latest))
      .mockResolvedValueOnce(jsonResponse({ items: [latest] }));

    await fetchLotteryHistory('今彩539', 1000);
    await fetchLotteryHistory('今彩539', 1000);

    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('最新期號在三十秒內跨重新初始化使用已儲存資料', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-31T14:00:00Z'));
    const latest = { period: '115000207', numbers: ['01', '02', '03', '04', '05'] };
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => jsonResponse(latest));

    await fetchLatestLotteryDraw('今彩539');
    resetReadCacheForTests();
    await fetchLatestLotteryDraw('今彩539');

    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('最新期號超過三十秒後不再重用 localStorage 資料', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-31T14:00:00Z'));
    const first = { period: '115000207', numbers: ['01', '02', '03', '04', '05'] };
    const second = { period: '115000208', numbers: ['06', '07', '08', '09', '10'] };
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse(first))
      .mockResolvedValueOnce(jsonResponse(second));

    await fetchLatestLotteryDraw('今彩539');
    resetReadCacheForTests();
    vi.advanceTimersByTime(30_000 - 1);
    await fetchLatestLotteryDraw('今彩539');

    resetReadCacheForTests();
    vi.advanceTimersByTime(1);
    await expect(fetchLatestLotteryDraw('今彩539')).resolves.toMatchObject({ period: '115208' });

    expect(fetchSpy).toHaveBeenCalledTimes(2);
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
      drawOrderNumbers: ['21', '18', '07', '44', '13', '38'],
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
      drawOrderNumbers: ['', '00', '1', '49', '50', '7'],
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
      drawOrderNumbers: ['01', '02', '03', '04', '05', '06'],
      specialNumber: '50',
    });

    const result = await fetchLatestLotteryDraw('六合彩');

    expect(result?.specialNumber).toBeUndefined();
    expect(result?.numbers).toEqual(['01', '02', '03', '04', '05', '06']);
    expect(result?.drawOrderNumbers).toEqual(['01', '02', '03', '04', '05', '06']);
  });
});


describe('cache freshness and draw corrections', () => {
  it('does not restart the latest expiry when persistent data enters memory', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-01T00:00:00Z'));
    const first = { period: '115207', numbers: ['01'] };
    const second = { period: '115208', numbers: ['02'] };
    const fetcher = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse(first))
      .mockResolvedValueOnce(jsonResponse(second));
    await fetchLatestLotteryDraw('今彩539');
    resetReadCacheForTests();
    vi.advanceTimersByTime(29_000);
    await fetchLatestLotteryDraw('今彩539');
    vi.advanceTimersByTime(1_000);
    expect((await fetchLatestLotteryDraw('今彩539'))?.period).toBe('115208');
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('refreshes same-period history and derived results at the original history expiry', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-01T00:00:00Z'));
    const latest = { period: '115208', numbers: ['02'] };
    let historicalNumber = '01';
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => jsonResponse(
      String(url).includes('/latest/') ? latest : { items: [latest, { period: '115207', numbers: [historicalNumber] }] },
    ));
    await fetchLotteryHistory('今彩539', 1000);
    resetReadCacheForTests();
    vi.advanceTimersByTime(299_000);
    const request = { lottery: '今彩539' as const, numberOrder: '依號碼由小到大排序' as const, historyRange: 1000 as const, numbers: ['01'] };
    expect((await fetchNumberReference(request)).items[0].matchSlots).toEqual([1]);
    historicalNumber = '03';
    await readThroughCache('matrix-rpc:correction-test', 60_000, async () => 'old');
    vi.advanceTimersByTime(1_000);
    expect((await fetchNumberReference(request)).items[0].matchSlots).toEqual([0]);
    expect(await readThroughCache('matrix-rpc:correction-test', 60_000, async () => 'fresh')).toBe('fresh');
  });

  it.each(['115208', '115209'])('invalidates dependent results when latest changes to %s', async (period) => {
    const first = { period: '115208', numbers: ['01'] };
    let latest = first;
    const fetcher = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => jsonResponse(
      String(url).includes('/latest/') ? latest : { items: [latest] },
    ));
    const request = { lottery: '今彩539' as const, numberOrder: '依號碼由小到大排序' as const, historyRange: 1000 as const, numbers: ['01'] };
    await fetchNumberReference(request);
    await readThroughCache('matrix-rpc:latest-change-test', 60_000, async () => 'old');
    latest = { period, numbers: ['03'] };
    clearReadCache('lottery:latest');
    localStorage.removeItem(`lottery-latest:${encodeURIComponent('今彩539')}`);
    await fetchLatestLotteryDraw('今彩539');
    expect((await fetchNumberReference(request)).items[0].matchSlots).toEqual([0]);
    expect(await readThroughCache('matrix-rpc:latest-change-test', 60_000, async () => 'fresh')).toBe('fresh');
    expect(fetcher).toHaveBeenCalledTimes(4);
  });
});


it('does not restore an older pending history after a newer draw invalidates it', async () => {
  let latest = { period: '115208', numbers: ['01'] };
  let resolveHistory!: (response: Response) => void;
  let historyStarted!: () => void;
  const started = new Promise<void>((resolve) => { historyStarted = resolve; });
  let historyCalls = 0;
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
    if (String(url).includes('/latest/')) return jsonResponse(latest);
    if (++historyCalls === 1) {
      historyStarted();
      return new Promise<Response>((resolve) => { resolveHistory = resolve; });
    }
    return jsonResponse({ items: [latest] });
  });
  const oldHistory = fetchLotteryHistory('今彩539', 1000);
  await started;
  latest = { period: '115209', numbers: ['03'] };
  clearReadCache('lottery:latest');
  localStorage.removeItem(`lottery-latest:${encodeURIComponent('今彩539')}`);
  await fetchLatestLotteryDraw('今彩539');
  await fetchLotteryHistory('今彩539', 1000);
  resolveHistory(jsonResponse({ items: [{ period: '115208', numbers: ['01'] }] }));
  expect((await oldHistory)[0].period).toBe('115209');
  resetReadCacheForTests();
  expect((await fetchLotteryHistory('今彩539', 1000))[0].period).toBe('115209');
  expect(historyCalls).toBe(2);
});
