// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { beforeEach, expect, test, vi } from 'vitest';
import { render } from '../../test/render-with-dialog';
import { MatrixExplorePage } from '../features/MatrixExplorePage';

const matrixApi = vi.hoisted(() => ({
  fetchExploreList: vi.fn(),
  fetchExploreValidation: vi.fn(),
  fetchTianyanList: vi.fn(),
  fetchTianyanValidation: vi.fn(),
}));

vi.mock('../matrix-algorithm-api', () => matrixApi);

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (cause: unknown) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

function envelope(id: string, number: string) {
  return {
    kind: 'explore', lottery: '今彩539', drawPeriod: '114000123',
    analysisVersion: `114000123:${id}`, status: 'complete', total: 1,
    duplicateStats: [{ number, count: 1 }],
    items: [{
      id, number: '44', lockedPosition: 2, predictionDistance: 3,
      consecutive: '準5進6', highestStreak: 5, predictionNumbers: [number],
      algorithmType: '加減', numberOrder: '依號碼由小到大排序',
      explorePeriods: 13, exploreDateOffset: 0, ruleCount: 1,
      referenceOffset: -7, referencePosition: 4,
    }],
  } as const;
}

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
  document.body.innerHTML = '';
  window.localStorage.clear();
  window.sessionStorage.clear();
  HTMLElement.prototype.scrollIntoView = vi.fn();
  globalThis.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ items: [] }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })) as typeof fetch;
});

test('keeps the latest different Explore query when an older response arrives last', async () => {
  const requestA = deferred<ReturnType<typeof envelope>>();
  const requestB = deferred<ReturnType<typeof envelope>>();
  matrixApi.fetchExploreList
    .mockReturnValueOnce(requestA.promise)
    .mockReturnValueOnce(requestB.promise);

  render(<MatrixExplorePage onNavigate={vi.fn()} />);
  const start = screen.getByRole('button', { name: '開始探索' });
  fireEvent.click(start); // request A: 加減
  fireEvent.click(screen.getByRole('button', { name: '合值版路' }));
  fireEvent.click(start); // request B: 合值
  expect(matrixApi.fetchExploreList).toHaveBeenCalledTimes(2);
  expect(matrixApi.fetchExploreList.mock.calls[0][0].roadTypes).toEqual(['加減']);
  expect(matrixApi.fetchExploreList.mock.calls[1][0].roadTypes).toEqual(['合值']);

  await act(async () => { requestB.resolve(envelope('request-b', '26')); await requestB.promise; });
  expect(screen.getByRole('button', { name: '篩選結果號碼 26，1次' })).toBeTruthy();

  await act(async () => { requestA.resolve(envelope('request-a', '22')); await requestA.promise; });
  expect(screen.queryByRole('button', { name: '篩選結果號碼 22，1次' })).toBeNull();
  expect(screen.getByRole('button', { name: '篩選結果號碼 26，1次' })).toBeTruthy();
});


const lotteryApi = vi.hoisted(() => ({fetchNumberReference:vi.fn(),fetchTongXing:vi.fn()}));
vi.mock('../lottery-api', async (original) => ({...await original<typeof import('../lottery-api')>(), ...lotteryApi}));
import { NumberReferencePage } from '../features/NumberReferencePage';
import { FeaturePageRouter } from '../FeaturePagesCore';

const draw = (period:string) => ({period,drawDate:'2026/09/01',numbers:['01','02','03','04','05'],matchSlots:[0,0,0,0,0]});

test.each([['reference',false],['reference',true],['tongxing',false],['tongxing',true]] as const)('%s keeps newer results after an older completion (failure=%s)', async (page, fails) => {
 const first=deferred<any>(), second=deferred<any>();
 const api=page==='reference'?lotteryApi.fetchNumberReference:lotteryApi.fetchTongXing;
 api.mockReset().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
 render(page==='reference'?<NumberReferencePage onNavigate={vi.fn()}/>:<FeaturePageRouter screen="tongxing" onNavigate={vi.fn()}/>);
 if(page==='tongxing') {
  fireEvent.change(screen.getByRole('textbox',{name:'號碼 1'}),{target:{value:'01'}});
  fireEvent.change(screen.getByRole('textbox',{name:'號碼 2'}),{target:{value:'02'}});
 }
 fireEvent.click(screen.getByRole('button',{name:'開始探索'}));
 if(page==='tongxing') fireEvent.click(screen.getByRole('button',{name:'展開同星探索設定'}));
 const selects=screen.getAllByRole('combobox');
 fireEvent.change(selects[0],{target:{value:'天天樂'}});
 fireEvent.click(screen.getByRole('button',{name:'開始探索'}));
 const response=(period:string)=>page==='reference'?{items:[draw(period)]}:{groups:[{lockedEntry:draw(period),predictedEntry:draw(period+'1')}]};
 await act(async()=>{second.resolve(response('NEW-B'));await second.promise;});
 expect(screen.getByText('NEW-B')).toBeTruthy();
 await act(async()=>{if(fails) first.reject(new Error('old offline')); else first.resolve(response('OLD-A')); await first.promise.catch(()=>{});});
 expect(screen.getByText('NEW-B')).toBeTruthy();
 expect(screen.queryByText('OLD-A')).toBeNull();
 expect(api.mock.calls[1][0].lottery).toBe('天天樂');
});

test('Tianyan ignores an older permission error while the latest query is loading', async () => {
 const first=deferred<any>(), second=deferred<any>();
 matrixApi.fetchTianyanList.mockReset().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
 render(<MatrixExplorePage onNavigate={vi.fn()} title="Matrix 天衍" roadTypes={['複合版路']}/>);
 fireEvent.click(screen.getByRole('button',{name:'開始天衍'}));
 fireEvent.change(screen.getByRole('combobox',{name:'彩種'}),{target:{value:'天天樂'}});
 fireEvent.click(screen.getByRole('button',{name:'開始天衍'}));
 await act(async()=>{first.reject({code:'FORBIDDEN'});await first.promise.catch(()=>{});});
 expect(screen.queryByRole('alertdialog')).toBeNull();
 expect(screen.queryByText('目前 Matrix Pro 方案不符合天衍的使用條件')).toBeNull();
 await act(async()=>{second.resolve({...envelope('tianyan-new','26'),kind:'tianyan',lottery:'天天樂'});await second.promise;});
 expect(screen.getByRole('button',{name:'篩選結果號碼 26，1次'})).toBeTruthy();
});
