// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { fetchLotteryHistory, fetchTongXing, fetchLatestLotteryDraw } from '../lottery-api';
import { clearReadCache, resetReadCacheForTests } from '../read-cache';

const latest = { period: '115000200', numbers: ['01'] };
const response = (body: unknown, status=200) => new Response(JSON.stringify(body), {status,headers:{'content-type':'application/json'}});
beforeEach(() => { localStorage.clear(); resetReadCacheForTests(); });
afterEach(() => { vi.restoreAllMocks(); });

it('follows bounded history pages without dropping later records and coalesces identical reads', async () => {
  const fetcher = vi.spyOn(globalThis,'fetch').mockImplementation(async (url) => {
    if(String(url).includes('/latest/')) return response({item:latest,revision:'r1'});
    const u = new URL(String(url));
    expect(u.searchParams.get('pageSize')).toBe('500');
    return u.searchParams.has('cursor')
      ? response({items:[{period:'115000198',numbers:['03']}],nextCursor:null,revision:'r1'})
      : response({items:[latest,{period:'115000199',numbers:['02']}],nextCursor:{offset:2,revision:'r1'},revision:'r1'});
  });
  const [a,b] = await Promise.all([fetchLotteryHistory('今彩539'),fetchLotteryHistory('今彩539')]);
  expect(a.map(x=>x.period)).toEqual(['115200','115199','115198']);
  expect(b).toEqual(a);
  expect(fetcher).toHaveBeenCalledTimes(3);
});

it('restarts a changed snapshot once and never returns mixed pages', async () => {
  let pageCalls=0;
  vi.spyOn(globalThis,'fetch').mockImplementation(async url => {
    if(String(url).includes('/latest/')) return response({item:latest,revision:'r1'});
    pageCalls++;
    if(pageCalls===1) return response({items:[latest],revision:'r1',nextCursor:{offset:1,revision:'r1'}});
    if(pageCalls===2) return response({error:'DRAW_HISTORY_CHANGED'},409);
    return response({items:[{period:'115000201',numbers:['02']}],revision:'r2',nextCursor:null});
  });
  expect((await fetchLotteryHistory('今彩539')).map(x=>x.period)).toEqual(['115201']);
  expect(pageCalls).toBe(3);
});

it('rejects repeated continuation cursors instead of looping', async () => {
  vi.spyOn(globalThis,'fetch').mockImplementation(async url => String(url).includes('/latest/')
    ? response({item:latest,revision:'r1'})
    : response({items:[latest],revision:'r1',nextCursor:{offset:1,revision:'r1'}}));
  await expect(fetchLotteryHistory('今彩539')).rejects.toThrow('INVALID_HISTORY_CURSOR');
});

it('invalidates history when only an older draw revision changes', async () => {
  let revision='r1';
  vi.spyOn(globalThis,'fetch').mockImplementation(async url => String(url).includes('/latest/')
    ? response({item:latest,revision})
    : response({items:[{period:'115000199',numbers:[revision==='r1'?'02':'03']}],nextCursor:null,revision}));
  expect((await fetchLotteryHistory('今彩539'))[0].numbers).toEqual(['02']);
  revision='r2'; clearReadCache('lottery:latest');
  localStorage.removeItem(`lottery-latest:${encodeURIComponent('今彩539')}`);
  await fetchLatestLotteryDraw('今彩539');
  expect((await fetchLotteryHistory('今彩539'))[0].numbers).toEqual(['03']);
});

it('queries matching tongxing pairs remotely and follows group pages', async () => {
  const inputs: unknown[]=[];
  vi.spyOn(globalThis,'fetch').mockImplementation(async (url,init) => {
    if(String(url).includes('/latest/')) return response({item:latest,revision:'r1'});
    expect(String(url)).toContain('/api/matrix/tongxing');
    const body=JSON.parse(String(init?.body)); inputs.push(body);
    return response({groups:[{lockedEntry:{period:body.cursor?'115000199':'115000198',numbers:['01']},predictedEntry:latest}],revision:'r1',nextCursor:body.cursor?null:{offset:1,revision:'r1'}});
  });
  const result=await fetchTongXing({lottery:'今彩539',numberOrder:'依號碼由小到大排序',numbers:['01'],futureOffset:1});
  expect(result.groups.map(g=>g.lockedEntry.period)).toEqual(['115198','115199']);
  expect(inputs).toHaveLength(2);
});
