import type { SupabaseConfig } from './supabase';

const lotteries = ['今彩539', '天天樂', '六合彩', '大樂透'] as const;
export const queryCheckIds = new Set(['railway-cards', 'railway-latest', 'railway-history', 'railway-tongxing', 'railway-number-reference', 'supabase-rpc-matrix_explore_list', 'supabase-rpc-matrix_explore_validation']);
const record = (value: unknown): value is Record<string, any> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const draw = (value: unknown, lottery: string): boolean => record(value)
  && typeof value.period === 'string' && value.period.length > 0
  && Array.isArray(value.numbers) && value.numbers.length === (['今彩539', '天天樂'].includes(lottery) ? 5 : 7)
  && new Set(value.numbers).size === value.numbers.length
  && value.numbers.every((number: unknown) => typeof number === 'string' && /^\d{2}$/.test(number) && Number(number) >= 1 && Number(number) <= (['今彩539', '天天樂'].includes(lottery) ? 39 : 49));

export function createApiQueryChecks(options: {
  loadWorkerUrl: () => Promise<string | undefined>;
  loadSupabaseConfig: () => Promise<SupabaseConfig>;
  fetcher: typeof fetch;
  timeoutMs: number;
}) {
  const deadline = Date.now() + options.timeoutMs;
  let active = 0;
  let expired = false;
  const queue: Array<() => void> = [];
  const request = async (url: string, init: RequestInit = {}): Promise<any> => {
    if (active >= 4) await new Promise<void>((resolve) => queue.push(resolve));
    else active += 1;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const remaining = deadline - Date.now();
      if (expired || remaining <= 0) throw new Error('查詢逾時，請重新檢查。');
      const work = async () => {
        const response = await options.fetcher(url, { ...init, cache: 'no-store', redirect: 'error', signal: controller.signal });
        if (!response.ok) throw new Error(`查詢失敗（HTTP ${response.status}）。`);
        return response.json();
      };
      return await Promise.race([work(), new Promise<never>((_, reject) => {
        timer = setTimeout(() => { expired = true; controller.abort(); reject(new Error('查詢逾時，請重新檢查。')); }, remaining);
      })]);
    } finally {
      if (timer) clearTimeout(timer);
      const next = queue.shift();
      if (next) next(); else active -= 1;
    }
  };
  let workerUrl: Promise<string | undefined> | undefined;
  let config: Promise<SupabaseConfig> | undefined;
  const rpc = async (name: 'matrix_explore_list' | 'matrix_explore_validation', body: unknown) => {
    const current = await (config ??= options.loadSupabaseConfig());
    return request(`${current.url}/rest/v1/rpc/${name}`, {
      method: 'POST',
      headers: {
        apikey: current.serviceRoleKey,
        Authorization: `Bearer ${current.serviceRoleKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ p_request: body }),
    });
  };
  const lists = new Map<string, Promise<any>>();
  const explore = (lottery: string) => {
    let result = lists.get(lottery);
    if (!result) {
      result = rpc('matrix_explore_list', { lottery, numberOrder: '依號碼由小到大排序', explorePeriods: 2, exploreDateOffset: 0, exploreRange: '標準範圍', ruleCount: 1, roadTypes: ['加減', '合值', '拖牌'], selectedStreaks: ['準2進3', '準3進4', '準4進5', '準5進6', '準6進7', '準7進8', '準8進9', '準9進10'] }).then((value) => {
        if (!record(value) || value.kind !== 'explore' || value.lottery !== lottery || value.status !== 'complete' || typeof value.drawPeriod !== 'string' || !value.drawPeriod || typeof value.analysisVersion !== 'string' || !value.analysisVersion || !Array.isArray(value.items) || value.total !== value.items.length || !value.items.every((item: unknown) => record(item) && typeof item.id === 'string' && item.id)) throw new Error('回傳資料格式不符。');
        return value;
      });
      lists.set(lottery, result);
    }
    return result;
  };
  return async (id: string) => {
    if (!queryCheckIds.has(id)) throw new Error('不支援此查詢檢查。');
    const samples = await Promise.all(lotteries.map(async (lottery) => {
      try {
        if (id.startsWith('supabase-rpc-')) {
          const list = await explore(lottery);
          if (id.endsWith('_validation')) {
            if (!list.items.length) return { lottery, ok: true, skipped: true };
            const itemId = list.items[0].id;
            const value = await rpc('matrix_explore_validation', { lottery, drawPeriod: list.drawPeriod, analysisVersion: list.analysisVersion, itemId, explorePeriods: 2, exploreRange: '標準範圍' });
            if (!record(value) || value.status !== 'complete' || value.lottery !== lottery || value.itemId !== itemId || value.drawPeriod !== list.drawPeriod || value.analysisVersion !== list.analysisVersion || !record(value.validation) || !Array.isArray(value.validation.ruleSets)) throw new Error('回傳資料格式不符。');
          }
          return { lottery, ok: true, period: list.drawPeriod, records: list.total };
        }
        const base = await (workerUrl ??= options.loadWorkerUrl());
        if (!base) throw new Error('尚未設定 Railway API 位址。');
        const kind = id.replace('railway-', '');
        const computation = kind === 'tongxing' || kind === 'number-reference';
        const path = `/api/matrix/${kind}${computation ? '' : `/${encodeURIComponent(lottery)}`}${kind === 'history' ? '?limit=1' : kind === 'cards' ? '?format=png' : ''}`;
        const value = await request(`${base.replace(/\/+$/, '')}${path}`, computation ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lottery, numberOrder: '依號碼由小到大排序', numbers: ['01', '02', '03'], ...(kind === 'tongxing' ? { futureOffset: 1 } : { historyRange: 1000 }) }) } : {});
        let valid = record(value);
        if (kind === 'latest') valid = valid && draw(value.item, lottery);
        else if (kind === 'history') valid = valid && Array.isArray(value.items) && value.items.length === 1 && draw(value.items[0], lottery);
        else if (kind === 'cards') valid = valid && value.lottery === lottery && typeof value.period === 'string' && Boolean(value.period) && record(value.cards) && ['draw', 'sorted'].every((order) => record(value.cards[order]) && typeof value.cards[order].url === 'string' && value.cards[order].url.startsWith('https://') && value.cards[order].mimeType === 'image/png');
        else if (kind === 'tongxing') valid = valid && value.lottery === lottery && value.futureOffset === 1 && Array.isArray(value.groups) && value.groups.every((group: unknown) => record(group) && draw(group.lockedEntry, lottery) && draw(group.predictedEntry, lottery) && group.lockedEntry.period !== group.predictedEntry.period);
        else valid = valid && value.lottery === lottery && value.historyRange === 1000 && Array.isArray(value.items) && value.items.length > 0 && value.items.every((item: unknown) => draw(item, lottery) && record(item) && Array.isArray(item.matchSlots) && item.matchSlots.length === item.numbers.length);
        if (!valid) throw new Error('回傳資料格式不符。');
        return { lottery, ok: true };
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : '';
        const safe = /^(查詢逾時|查詢失敗（HTTP \d{3}）|回傳資料格式不符|尚未設定 Railway API 位址)/.test(message) ? message : '查詢連線失敗。';
        return { lottery, ok: false, error: safe };
      }
    }));
    return { ok: samples.every((sample) => sample.ok), skipped: samples.some((sample) => 'skipped' in sample), samples, error: samples.filter((sample) => !sample.ok).map((sample) => `${sample.lottery}：${'error' in sample ? sample.error : ''}`).join(' ') };
  };
}
