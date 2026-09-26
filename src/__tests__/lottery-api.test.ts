// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { API_REQUEST_TIMEOUT_MS } from '../lib/api-resilience';
import { LOTTERY_API_BASE, confirmPublishedResultRevisions, fetchLatestLotteryDraw, fetchLatestLotteryResult, fetchLatestLotteryResultState, fetchLotteryHistory, fetchLotteryHistoryYears, fetchNumberReference, fetchTongXing, invalidatePublishedLotteryData, normalizePeriod } from '../lottery-api';
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
  it('reuses the completed public home result across reloads, then rechecks after the fallback window', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-24T07:00:00Z'));
    const fetcher = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ drawDate: '2026-09-23', items: [{ lottery: '今彩539', period: '115000231' }], dueLotteries: [] }))
      .mockResolvedValueOnce(jsonResponse({ drawDate: '2026-09-24', items: [{ lottery: '今彩539', period: '115000232' }], dueLotteries: [] }));
    const first = await fetchLatestLotteryResultState();
    resetReadCacheForTests();
    expect(await fetchLatestLotteryResultState()).toEqual(first);
    expect(fetcher).toHaveBeenCalledTimes(1);
    vi.setSystemTime(new Date('2026-09-24T07:15:01Z'));
    expect((await fetchLatestLotteryResultState()).items[0].period).toBe('115000232');
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('a published draw invalidates the mobile snapshot even before its fallback expires', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-24T07:00:00Z'));
    const fetcher = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ item: { period: '115000231', resultStatus: 'confirmed', numbers: ['01', '02', '03', '04', '05'] }, revision: 'r1' }))
      .mockResolvedValueOnce(jsonResponse({ item: { period: '115000231', resultStatus: 'confirmed', numbers: ['06', '07', '08', '09', '10'] }, revision: 'r2' }));
    expect((await fetchLatestLotteryDraw('今彩539'))?.numbers).toEqual(['01', '02', '03', '04', '05']);
    resetReadCacheForTests();
    invalidatePublishedLotteryData('今彩539');
    expect((await fetchLatestLotteryDraw('今彩539'))?.numbers).toEqual(['06', '07', '08', '09', '10']);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('rechecks the due lottery calendar on each dated homepage request', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-24T07:00:00Z'));
    const fetcher = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ drawDate: '2026-09-23', items: [], dueLotteries: ['今彩539'] }))
      .mockResolvedValueOnce(jsonResponse({ drawDate: '2026-09-23', items: [], dueLotteries: [] }));
    expect((await fetchLatestLotteryResultState('2026-09-23')).dueLotteries).toEqual(['今彩539']);
    expect((await fetchLatestLotteryResultState('2026-09-23')).dueLotteries).toEqual([]);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('keeps public GET headers simple while retrying a transient read response once', async () => {
    const draw = { period: '115000207', numbers: ['01', '02', '03', '04', '05'] };
    const fetcher = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(jsonResponse(draw));

    await expect(fetchLatestLotteryDraw('今彩539')).resolves.toMatchObject({ period: '115207' });

    expect(fetcher).toHaveBeenCalledTimes(2);
    const requestIds = fetcher.mock.calls.map(([, init]) => (
      new Headers(init?.headers).get('X-Request-ID')
    ));
    expect(requestIds).toEqual([null, null]);
    expect(fetcher.mock.calls.every(([, init]) => new Headers(init?.headers).get('Accept') === 'application/json')).toBe(true);
  });

  it('preserves the existing request id on TongXing POST', async () => {
    const fetcher = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) =>
      jsonResponse(String(url).includes('/latest/')
        ? { period: '115000207', numbers: ['01', '02', '03', '04', '05'] }
        : { groups: [], nextCursor: null }));
    await fetchTongXing({
      lottery: '今彩539', numberOrder: '依號碼由小到大排序', numbers: ['01', '02'], futureOffset: 1,
    });
    const post = fetcher.mock.calls.find(([url]) => String(url).includes('/tongxing'));
    expect(post).toBeDefined();
    expect(new Headers(post?.[1]?.headers).get('X-Request-ID')).toMatch(/^[0-9a-f-]{36}$/);
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

  it('首頁跑馬燈只接收最新正式開獎日已完整分析的彩種', async () => {
    const fetcher = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(jsonResponse({
      drawDate: '2026-09-23',
      items: [
        { lottery: '今彩539', period: '115000231' },
        { lottery: '大樂透', period: '115000091' },
      ],
    }));

    await expect(fetchLatestLotteryResult()).resolves.toEqual([
      { lottery: '今彩539', period: '115000231' },
      { lottery: '大樂透', period: '115000091' },
    ]);
    expect(fetcher).toHaveBeenCalledWith(
      `${LOTTERY_API_BASE}/api/matrix/latest-result`,
      expect.objectContaining({ headers: expect.any(Headers) }),
    );
  });

  it('首頁時段狀態同一次讀取取得正式完成彩種與官方開獎日清單', async () => {
    const fetcher = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(jsonResponse({
      drawDate: '2026-09-23',
      dueLotteries: ['今彩539', '六合彩'],
      items: [
        { lottery: '今彩539', period: '115000231' },
      ],
    }));

    await expect(fetchLatestLotteryResultState('2026-09-23')).resolves.toEqual({
      drawDate: '2026-09-23',
      dueLotteries: ['今彩539', '六合彩'],
      items: [{ lottery: '今彩539', period: '115000231' }],
    });
    expect(fetcher).toHaveBeenCalledWith(
      `${LOTTERY_API_BASE}/api/matrix/latest-result?cycleDate=2026-09-23`,
      expect.objectContaining({ headers: expect.any(Headers) }),
    );
  });

  it('舊版完成結果未附期號時仍可顯示彩種，但不能提供本期完成依據', async () => {
    mockJsonResponse({ drawDate: '2026-09-23', items: [{ lottery: '今彩539' }] });
    await expect(fetchLatestLotteryResultState('2026-09-23')).resolves.toEqual({
      drawDate: '2026-09-23', dueLotteries: [], items: [{ lottery: '今彩539' }],
    });
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

  it('歷史版本未變時超過五分鐘只核對最新版本，不重傳歷史', async () => {
    vi.useFakeTimers();
    const draw = { period: '115000207', numbers: ['01'], resultStatus: 'confirmed' };
    const fetcher = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) =>
      String(url).includes('/latest/')
        ? jsonResponse({ item: draw, revision: 'unchanged' })
        : jsonResponse({ items: [draw], revision: 'unchanged', nextCursor: null }));
    await fetchLotteryHistory('今彩539', 1000);
    resetReadCacheForTests();
    vi.advanceTimersByTime(6 * 60_000);
    await expect(fetchLotteryHistory('今彩539', 1000)).resolves.toMatchObject([{ numbers: ['01'] }]);
    expect(fetcher.mock.calls.filter(([url]) => String(url).includes('/history/'))).toHaveLength(1);
  });

  it('缺少歷史版本時仍在五分鐘後重新下載，不無限延用舊資料', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-22T20:30:00+08:00'));
    const draw = { period: '115000207', numbers: ['01'], resultStatus: 'confirmed' };
    const fetcher = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) =>
      String(url).includes('/latest/')
        ? jsonResponse({ item: draw, revision: 'latest-only' })
        : jsonResponse({ items: [draw], nextCursor: null }));
    await fetchLotteryHistory('今彩539', 1000);
    vi.advanceTimersByTime(6 * 60_000);
    await fetchLotteryHistory('今彩539', 1000);
    expect(fetcher.mock.calls.filter(([url]) => String(url).includes('/history/'))).toHaveLength(2);
  });

  it('舊期資料更正而最新期號未變，仍以版本更新歷史', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-22T20:30:00+08:00'));
    const draw = { period: '115000207', numbers: ['01'], resultStatus: 'confirmed' };
    let revision = 'before';
    const fetcher = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) =>
      String(url).includes('/latest/')
        ? jsonResponse({ item: draw, revision })
        : jsonResponse({ items: [{ ...draw, numbers: [revision === 'before' ? '01' : '02'] }], revision, nextCursor: null }));
    await fetchLotteryHistory('今彩539', 1000);
    revision = 'after';
    vi.advanceTimersByTime(31_000);
    await expect(fetchLotteryHistory('今彩539', 1000)).resolves.toMatchObject([{ numbers: ['02'] }]);
    expect(fetcher.mock.calls.filter(([url]) => String(url).includes('/history/'))).toHaveLength(2);
  });

  it('同星只下載資料庫篩選後的配對結果', async () => {
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
      return jsonResponse({ ...request, groups: [{ lockedEntry: history.items[1], predictedEntry: history.items[0] }], nextCursor: null });
    });

    await expect(fetchTongXing(request)).resolves.toMatchObject({
      groups: [{ lockedEntry: { period: '115207' }, predictedEntry: { period: '115208' } }],
    });
    expect(fetchSpy.mock.calls.map(([url]) => String(url))).toContain(`${LOTTERY_API_BASE}/api/matrix/tongxing`);
    expect(fetchSpy.mock.calls.some(([url]) => String(url).includes('/history/'))).toBe(false);
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
    vi.setSystemTime(new Date('2026-09-01T13:00:00Z'));
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
    vi.setSystemTime(new Date('2026-09-01T13:00:00Z'));
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


describe('Taipei lottery cache windows', () => {
  it.each(['今彩539', '六合彩', '大樂透'] as const)(
    '%s keeps latest draw cached from 01:00 until 20:00 and expires at 20:00',
    async (lottery) => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-09-22T10:00:00+08:00'));
      const draw = { period: '115000207', numbers: ['01', '02', '03', '04', '05'] };
      const fetcher = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => jsonResponse(draw));

      await fetchLatestLotteryDraw(lottery);
      resetReadCacheForTests();
      vi.setSystemTime(new Date('2026-09-22T19:59:59+08:00'));
      await fetchLatestLotteryDraw(lottery);
      expect(fetcher).toHaveBeenCalledTimes(1);

      resetReadCacheForTests();
      vi.setSystemTime(new Date('2026-09-22T20:00:00+08:00'));
      await fetchLatestLotteryDraw(lottery);
      expect(fetcher).toHaveBeenCalledTimes(2);
    },
  );

  it('天天樂 keeps latest draw cached from 13:00 through overnight until 09:00', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-22T23:00:00+08:00'));
    const draw = { period: '26092201', numbers: ['01', '02', '03', '04', '05'] };
    const fetcher = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => jsonResponse(draw));

    await fetchLatestLotteryDraw('天天樂');
    resetReadCacheForTests();
    vi.setSystemTime(new Date('2026-09-23T08:59:59+08:00'));
    await fetchLatestLotteryDraw('天天樂');
    expect(fetcher).toHaveBeenCalledTimes(1);

    resetReadCacheForTests();
    vi.setSystemTime(new Date('2026-09-23T09:00:00+08:00'));
    await fetchLatestLotteryDraw('天天樂');
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it.each(['今彩539', '六合彩', '大樂透'] as const)(
    '%s keeps five-minute-class reads cached until 20:00 inside the stable window',
    async (lottery) => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-09-22T10:00:00+08:00'));
      const draw = { period: '115000207', numbers: ['01', '02', '03', '04', '05'] };
      const fetcher = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => (
        String(url).includes('/history-years/')
          ? jsonResponse({ years: ['2026'] })
          : jsonResponse(draw)
      ));

      await fetchLotteryHistoryYears(lottery);
      vi.setSystemTime(new Date('2026-09-22T19:59:59+08:00'));
      await fetchLotteryHistoryYears(lottery);
      expect(fetcher.mock.calls.filter(([url]) => String(url).includes('/history-years/'))).toHaveLength(1);

      vi.setSystemTime(new Date('2026-09-22T20:00:00+08:00'));
      await fetchLotteryHistoryYears(lottery);
      expect(fetcher.mock.calls.filter(([url]) => String(url).includes('/history-years/'))).toHaveLength(2);
    },
  );

  it('天天樂 keeps five-minute-class reads cached until 09:00 across midnight', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-22T23:00:00+08:00'));
    const draw = { period: '26092201', numbers: ['01', '02', '03', '04', '05'] };
    const fetcher = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => (
      String(url).includes('/history-years/')
        ? jsonResponse({ years: ['2026'] })
        : jsonResponse(draw)
    ));

    await fetchLotteryHistoryYears('天天樂');
    vi.setSystemTime(new Date('2026-09-23T08:59:59+08:00'));
    await fetchLotteryHistoryYears('天天樂');
    expect(fetcher.mock.calls.filter(([url]) => String(url).includes('/history-years/'))).toHaveLength(1);

    vi.setSystemTime(new Date('2026-09-23T09:00:00+08:00'));
    await fetchLotteryHistoryYears('天天樂');
    expect(fetcher.mock.calls.filter(([url]) => String(url).includes('/history-years/'))).toHaveLength(2);
  });
});


describe('persistent safe read caches', () => {
  it('keeps history years across a PWA memory reset until the stable window ends', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-22T10:00:00+08:00'));
    const draw = { period: '115000207', numbers: ['01', '02', '03', '04', '05'] };
    const fetcher = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => (
      String(url).includes('/history-years/')
        ? jsonResponse({ years: ['2026', '2025'] })
        : jsonResponse(draw)
    ));

    await expect(fetchLotteryHistoryYears('今彩539')).resolves.toEqual(['2026', '2025']);
    resetReadCacheForTests();
    vi.setSystemTime(new Date('2026-09-22T19:59:59+08:00'));
    await expect(fetchLotteryHistoryYears('今彩539')).resolves.toEqual(['2026', '2025']);
    expect(fetcher.mock.calls.filter(([url]) => String(url).includes('/history-years/'))).toHaveLength(1);

    resetReadCacheForTests();
    vi.setSystemTime(new Date('2026-09-22T20:00:00+08:00'));
    await fetchLotteryHistoryYears('今彩539');
    expect(fetcher.mock.calls.filter(([url]) => String(url).includes('/history-years/'))).toHaveLength(2);
  });

  it('keeps the same TongXing query across a PWA memory reset inside the stable window', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-22T10:00:00+08:00'));
    const draw = { period: '115000207', numbers: ['01', '02', '03', '04', '05'] };
    const request = {
      lottery: '今彩539' as const,
      numberOrder: '依號碼由小到大排序' as const,
      numbers: ['01', '02'],
      futureOffset: 1,
    };
    const fetcher = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => (
      String(url).includes('/latest/')
        ? jsonResponse(draw)
        : jsonResponse({ ...request, groups: [{ lockedEntry: draw, predictedEntry: draw }], nextCursor: null })
    ));

    await fetchTongXing(request);
    resetReadCacheForTests();
    vi.setSystemTime(new Date('2026-09-22T19:59:59+08:00'));
    await fetchTongXing(request);

    expect(fetcher.mock.calls.filter(([url]) => String(url).includes('/tongxing'))).toHaveLength(1);
  });

  it('expires persisted TongXing after five minutes outside the stable window', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-22T20:30:00+08:00'));
    const draw = { period: '115000207', numbers: ['01', '02', '03', '04', '05'] };
    const request = {
      lottery: '今彩539' as const,
      numberOrder: '依號碼由小到大排序' as const,
      numbers: ['01'],
      futureOffset: 1,
    };
    const fetcher = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => (
      String(url).includes('/latest/')
        ? jsonResponse(draw)
        : jsonResponse({ ...request, groups: [{ lockedEntry: draw, predictedEntry: draw }], nextCursor: null })
    ));

    await fetchTongXing(request);
    resetReadCacheForTests();
    vi.setSystemTime(new Date('2026-09-22T20:34:59+08:00'));
    await fetchTongXing(request);
    expect(fetcher.mock.calls.filter(([url]) => String(url).includes('/tongxing'))).toHaveLength(1);

    resetReadCacheForTests();
    vi.setSystemTime(new Date('2026-09-22T20:35:00+08:00'));
    await fetchTongXing(request);
    expect(fetcher.mock.calls.filter(([url]) => String(url).includes('/tongxing'))).toHaveLength(2);
  });
});


it('does not let pending old history years rewind the period or return stale years', async () => {
  let latest = { period: '115208', numbers: ['01'] };
  let resolveYears!: (response: Response) => void;
  let yearsStarted!: () => void;
  const started = new Promise<void>(resolve => { yearsStarted = resolve; });
  let calls = 0;
  vi.spyOn(globalThis, 'fetch').mockImplementation(async url => {
    if (String(url).includes('/latest/')) return jsonResponse(latest);
    if (++calls === 1) {
      yearsStarted();
      return new Promise<Response>(resolve => { resolveYears = resolve; });
    }
    return jsonResponse({ years: ['2027', '2026'] });
  });
  const pending = fetchLotteryHistoryYears('今彩539');
  await started;
  latest = { period: '115209', numbers: ['03'] };
  invalidatePublishedLotteryData('今彩539');
  await fetchLotteryHistoryYears('今彩539');
  resolveYears(jsonResponse({ years: ['2026'] }));
  expect(await pending).toEqual(['2027', '2026']);
  expect(localStorage.getItem(`matrix-result-period:${encodeURIComponent('今彩539')}`)).toBe('115209');
  resetReadCacheForTests();
  expect(await fetchLotteryHistoryYears('今彩539')).toEqual(['2027', '2026']);
  expect(calls).toBe(2);
});


it.each([undefined, '2026-09-26'])('a late completed-result response cannot restore stale data after a readiness probe (%s)', async cycleDate => {
  const revisions = { '今彩539': 'new', '天天樂': 'new', '六合彩': 'new', '大樂透': 'new' };
  let resolveOld!: (response: Response) => void;
  let begin!: () => void;
  const started = new Promise<void>(resolve => { begin = resolve; });
  let calls = 0;
  vi.spyOn(globalThis, 'fetch').mockImplementation(async url => {
    if (String(url).includes('/result-revisions')) return jsonResponse({ revisions });
    if (++calls === 1) { begin(); return new Promise<Response>(resolve => { resolveOld = resolve; }); }
    return jsonResponse({ drawDate: '2026-09-26', items: [{ lottery: '今彩539', period: '115209' }], revisions });
  });
  const pending = fetchLatestLotteryResultState(cycleDate);
  await started;
  // A legacy successful cache has no verified version baseline.
  localStorage.setItem('lottery-published-result:latest', JSON.stringify({ savedAt: Date.now(), value: {
    drawDate: '2026-09-25', items: [{ lottery: '今彩539', period: '115208' }], revisions: { ...revisions, '今彩539': 'old' },
  } }));
  await confirmPublishedResultRevisions(() => true);
  resolveOld(jsonResponse({ drawDate: '2026-09-25', items: [{ lottery: '今彩539', period: '115208' }], revisions: { ...revisions, '今彩539': 'old' } }));
  const value = await pending;
  expect(value.items[0].period).toBe('115209');
  expect(value.revisions).toEqual(revisions);
  expect(calls).toBe(2);
});

it('a new dated snapshot arriving before the readiness probe invalidates old derived caches', async () => {
  const old = { '今彩539': 'before-return', '天天樂': 'b', '六合彩': 'c', '大樂透': 'd' };
  const next = { ...old, '今彩539': 'new-generation-same-period' };
  vi.spyOn(globalThis, 'fetch').mockImplementation(async url => String(url).includes('/result-revisions')
    ? jsonResponse({ revisions: next })
    : jsonResponse({ drawDate: '2026-09-26', items: [{ lottery: '今彩539', period: '115209' }], revisions: old }));
  await fetchLatestLotteryResultState();
  const load = vi.fn(async () => 'old-derived');
  await readThroughCache('matrix-rpc:test-return', 60_000, load);
  vi.mocked(globalThis.fetch).mockImplementation(async url => String(url).includes('/result-revisions')
    ? jsonResponse({ revisions: next })
    : jsonResponse({ drawDate: '2026-09-26', items: [{ lottery: '今彩539', period: '115209' }], revisions: next }));
  await fetchLatestLotteryResultState('2026-09-26');
  await confirmPublishedResultRevisions(() => true);
  const reload = vi.fn(async () => 'new-derived');
  expect(await readThroughCache('matrix-rpc:test-return', 60_000, reload)).toBe('new-derived');
  expect(reload).toHaveBeenCalledTimes(1);
});

it('a legacy snapshot without revisions is revalidated once when a versioned dated result arrives', async () => {
  const next = { '今彩539': 'legacy-upgrade', '天天樂': 'b', '六合彩': 'c', '大樂透': 'd' };
  vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(jsonResponse({ drawDate: '2026-09-26', items: [] }));
  await fetchLatestLotteryResultState();
  await readThroughCache('matrix-rpc:legacy-derived', 60_000, async () => 'legacy');
  vi.mocked(globalThis.fetch).mockImplementation(async url => String(url).includes('/result-revisions')
    ? jsonResponse({ revisions: next })
    : jsonResponse({ drawDate: '2026-09-26', items: [], revisions: next }));
  await fetchLatestLotteryResultState('2026-09-26');
  expect(await readThroughCache('matrix-rpc:legacy-derived', 60_000, async () => 'fresh')).toBe('fresh');
  await confirmPublishedResultRevisions(() => true);
  expect(await readThroughCache('matrix-rpc:legacy-derived', 60_000, async () => 'unexpected-reload')).toBe('fresh');
});

it('a late old revision probe cannot replace a newer accepted snapshot baseline', async () => {
  vi.spyOn(Date, 'now').mockReturnValue(Date.now());
  const old = { '今彩539': 'probe-old', '天天樂': 'b', '六合彩': 'c', '大樂透': 'd' };
  const next = { ...old, '今彩539': 'snapshot-new' };
  let finishProbe!: (response: Response) => void;
  let startProbe!: () => void;
  let probes = 0;
  const started = new Promise<void>(resolve => { startProbe = resolve; });
  vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(jsonResponse({ drawDate: '2026-09-26', items: [], revisions: old }));
  await fetchLatestLotteryResultState('2026-09-26');
  vi.mocked(globalThis.fetch).mockImplementation(async url => {
    if (String(url).includes('/result-revisions')) {
      if (++probes > 1) return jsonResponse({ revisions: next });
      startProbe();
      return new Promise<Response>(resolve => { finishProbe = resolve; });
    }
    return jsonResponse({ drawDate: '2026-09-26', items: [], revisions: next });
  });
  const probe = confirmPublishedResultRevisions(() => true);
  await started;
  await fetchLatestLotteryResultState('2026-09-26');
  await readThroughCache('matrix-rpc:new-snapshot-derived', 60_000, async () => 'new-snapshot');
  finishProbe(jsonResponse({ revisions: old }));
  await probe;
  expect(await readThroughCache('matrix-rpc:new-snapshot-derived', 60_000, async () => 'invalidated')).toBe('new-snapshot');
});

it('reconfirms a newer readiness version when a delayed intermediate snapshot arrives first', async () => {
  const initial = { '今彩539': 'initial', '天天樂': 'b', '六合彩': 'c', '大樂透': 'd' };
  const intermediate = { ...initial, '今彩539': 'intermediate' };
  const newest = { ...initial, '今彩539': 'newest' };
  const snapshot = (period: string, revisions: typeof initial) => ({
    drawDate: '2026-09-26', items: [{ lottery: '今彩539', period }], revisions,
  });
  vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(jsonResponse(snapshot('115208', initial)));
  await fetchLatestLotteryResultState();
  clearReadCache('lottery:published-result:');
  localStorage.removeItem('lottery-published-result:latest');
  let finishSnapshot!: (response: Response) => void;
  let finishProbe!: (response: Response) => void;
  let startSnapshot!: () => void;
  let startProbe!: () => void;
  const snapshotStarted = new Promise<void>(resolve => { startSnapshot = resolve; });
  const probeStarted = new Promise<void>(resolve => { startProbe = resolve; });
  let probeCalls = 0;
  let snapshotCalls = 0;
  vi.mocked(globalThis.fetch).mockImplementation(async url => {
    if (String(url).includes('/result-revisions')) {
      if (++probeCalls > 1) return jsonResponse({ revisions: newest });
      return new Promise<Response>(resolve => { finishProbe = resolve; startProbe(); });
    }
    if (++snapshotCalls > 1) return jsonResponse(snapshot('115210', newest));
    return new Promise<Response>(resolve => { finishSnapshot = resolve; startSnapshot(); });
  });
  const pendingSnapshot = fetchLatestLotteryResultState();
  const pendingProbe = confirmPublishedResultRevisions(() => true);
  await Promise.all([snapshotStarted, probeStarted]);
  finishSnapshot(jsonResponse(snapshot('115209', intermediate)));
  expect((await pendingSnapshot).items[0].period).toBe('115209');
  finishProbe(jsonResponse({ revisions: newest }));
  await pendingProbe;
  expect((await fetchLatestLotteryResultState()).items[0].period).toBe('115210');
  expect(probeCalls).toBe(2);
});

it.each(['persisted', 'legacy-network', 'same-version-network'] as const)('a %s read cannot suppress an in-flight newer readiness revision', async kind => {
  const old = { '今彩539': `hydrate-old-${kind}`, '天天樂': 'b', '六合彩': 'c', '大樂透': 'd' };
  const next = { ...old, '今彩539': `probe-new-${kind}` };
  vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(jsonResponse({ drawDate: '2026-09-26', items: [], revisions: old }));
  await fetchLatestLotteryResultState();
  resetReadCacheForTests();
  await readThroughCache('matrix-rpc:hydrate-derived', 60_000, async () => 'old-derived');
  let finish!: (response: Response) => void;
  let begin!: () => void;
  const started = new Promise<void>(resolve => { begin = resolve; });
  vi.mocked(globalThis.fetch).mockImplementation(async url => {
    if (String(url).includes('/result-revisions')) {
      begin();
      return new Promise<Response>(resolve => { finish = resolve; });
    }
    return jsonResponse({ drawDate: '2026-09-26', items: [], ...(kind === 'same-version-network' ? { revisions: old } : {}) });
  });
  const pending = confirmPublishedResultRevisions(() => true);
  await started;
  await fetchLatestLotteryResultState(kind === 'persisted' ? undefined : '2026-09-26');
  finish(jsonResponse({ revisions: next }));
  await pending;
  expect(await readThroughCache('matrix-rpc:hydrate-derived', 60_000, async () => 'new-derived')).toBe('new-derived');
});
