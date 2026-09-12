// @vitest-environment jsdom
import { act, cleanup } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { fetchLatestLotteryDraw, fetchLotteryHistory, fetchNumberReference, fetchTongXing, fetchMatrixCardManifest } from '../lottery-api';
import { resetReadCacheForTests } from '../read-cache';

const sorted = ['01', '08', '14', '25', '39'];
const actual = ['25', '01', '39', '08', '14'];
const preliminary = { period: '115209', drawDate: '2026/09/12', numbers: sorted, sortedNumbers: sorted, drawOrderNumbers: null, resultStatus: 'preliminary' as const };
const previous = { period: '115208', drawDate: '2026/09/11', numbers: sorted, sortedNumbers: sorted, drawOrderNumbers: actual };
const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers(); resetReadCacheForTests(); localStorage.clear(); });

test.each([[null], [undefined], [[]]])('missing actual order (%s) never falls back to sorted numbers in any projection', async (drawOrderNumbers) => {
  const draw = { ...preliminary, drawOrderNumbers };
  vi.spyOn(globalThis, 'fetch').mockImplementation(async url => json(String(url).includes('/latest/') ? draw : { items: [draw, previous] }));
  expect((await fetchLatestLotteryDraw('今彩539'))?.drawOrderNumbers).toEqual([]);
  const history = await fetchLotteryHistory('今彩539', 1000);
  expect(history[0].drawOrderNumbers).toEqual([]);
  expect(history[0].sortedNumbers).toEqual(sorted);
  const reference = await fetchNumberReference({ lottery: '今彩539', numberOrder: '依實際開獎順序排序', historyRange: 1000, numbers: ['01'] });
  expect(reference.items[1]).toMatchObject({ period: '115209', numbers: [], matchSlots: [] });
  const sameStar = await fetchTongXing({ lottery: '今彩539', numberOrder: '依實際開獎順序排序', numbers: ['01', '08'], futureOffset: 1 });
  expect(sameStar.groups[0].predictedEntry).toMatchObject({ period: '115209', numbers: [] });
});

test.each(['115209', '115210'])('formal same-date enrichment (%s) refreshes latest, history and derived results at the next minute', async period => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-12T12:35:00Z'));
  let current: object = preliminary;
  const fetcher = vi.spyOn(globalThis, 'fetch').mockImplementation(async url => json(String(url).includes('/latest/') ? current : { items: [current, previous] }));
  const input = { lottery: '今彩539' as const, numberOrder: '依實際開獎順序排序' as const, historyRange: 1000 as const, numbers: ['25'] };
  await fetchNumberReference(input);
  current = { ...preliminary, period, resultStatus: 'confirmed', drawOrderNumbers: actual };
  await act(async () => { vi.advanceTimersByTime(60_000); });
  expect((await fetchLatestLotteryDraw('今彩539'))?.period).toBe(period);
  const result = await fetchNumberReference(input);
  expect(result.items).toHaveLength(2);
  expect(result.items[1]).toMatchObject({ period, numbers: actual, matchSlots: [1, 0, 0, 0, 0] });
  expect(fetcher).toHaveBeenCalledTimes(4);
});

test('a preliminary manifest accepts only the current sorted card', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ lottery: '今彩539', period: '115209', cards: { sorted: { url: '/cards/115209/sorted.png' } } }));
  const manifest = await fetchMatrixCardManifest('今彩539');
  expect(manifest.cards.sorted?.url).toBe('/cards/115209/sorted.png');
  expect(manifest.cards.draw).toBeUndefined();
});

test('legacy persisted snapshots cannot restore fabricated actual order', async () => {
  localStorage.setItem(`lottery-latest:${encodeURIComponent('今彩539')}`, JSON.stringify({ savedAt: Date.now(), value: { ...previous, drawOrderNumbers: sorted } }));
  const fetcher = vi.spyOn(globalThis, 'fetch').mockResolvedValue(json(preliminary));
  expect((await fetchLatestLotteryDraw('今彩539'))?.drawOrderNumbers).toEqual([]);
  expect(fetcher).toHaveBeenCalledTimes(1);
});

test('a legacy response is confirmed without inventing missing actual order or its special ball', async () => {
  const draw = { period: '115209', numbers: ['01', '08', '14', '25', '39', '44'], specialNumber: '09' };
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(json(draw));
  expect(await fetchLatestLotteryDraw('大樂透')).toMatchObject({ resultStatus: 'confirmed', drawOrderNumbers: [], sortedNumbers: ['01', '08', '14', '25', '39', '44', '09'] });
});
