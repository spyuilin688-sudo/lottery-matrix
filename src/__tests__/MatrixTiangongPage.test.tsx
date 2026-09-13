// @vitest-environment jsdom
import { render } from '../../test/render-with-dialog';
import { invalidateMatrixData } from "../matrix-data-revision";
import type { Session } from '@supabase/supabase-js';
import { updateAlgorithmCacheSession } from '../auth/algorithm-cache-scope';

import { act, fireEvent, screen, within } from '@testing-library/react';
import { beforeEach, expect, test, vi } from 'vitest';
import { MatrixTiangongPage } from '../FeaturePages';
import { TiangongValidationProcess } from '../features/MatrixTiangongPage';

const matrixApi = vi.hoisted(() => ({
  fetchExploreList: vi.fn(), fetchExploreValidation: vi.fn(),
  fetchTianyanList: vi.fn(), fetchTianyanValidation: vi.fn(),
  fetchTiangongList: vi.fn(), fetchTiangongValidation: vi.fn(),
}));
vi.mock('../matrix-algorithm-api', () => matrixApi);

const envelope = {
  kind: 'tiangong', lottery: '今彩539', drawPeriod: '114000123',
  analysisVersion: '114000123:v1', status: 'complete', total: 1,
  items: [{
    id: 'tg-api-1', eligiblePeriodRange: 50, interval: 2,
    predictedPosition: 3, predictionNumber: '12', roadType: '加減＋合值',
    exploreDirection: '固定', firstStageDirection: '固定', firstRoadType: '加減',
    secondStageDirection: '固定', secondRoadType: '合值',
  }],
} as const;

beforeEach(() => {
  document.body.innerHTML = '';
  matrixApi.fetchTiangongList.mockReset().mockResolvedValue(envelope);
  matrixApi.fetchTiangongValidation.mockReset().mockResolvedValue({
    ...envelope, itemId: 'tg-api-1',
    validation: { itemId: 'tg-api-1', evidence: {
      stage1_operation: { type: 'add_sub', residue: 4 }, stage2_operation: { type: 'sum', value: 28 },
      rows: [{
        group: 'C', role: 'validation',
        source: { period: '114000100', position: 2, number: '08', numbers: [1,8,12,20,30] },
        stage1: { period: '114000109', position: 3, calculated_number: '12', actual_number: '12', matched: true },
        stage2: { period: '114000114', position: 4, calculated_number: '16', actual_number: '16', matched: true },
      }],
      d_exclusion: {
        status: 'breaks_at_stage2',
        source: { period: '114000091', position: 1, number: '05' },
        stage1: { period: '114000096', position: 2, calculated_number: '10', actual_number: '10', matched: true },
        stage2: { period: '114000101', position: 3, calculated_number: '14', actual_number: '15', matched: false },
      },
    } },
  });
});

test('天工固定顯示二段式設定，且不再提供模式與命中條件選項', () => {
  render(<MatrixTiangongPage onNavigate={vi.fn()} />);
  const generalCard = screen.getByRole('heading', { name: '探索設定' }).closest('section') as HTMLElement;
  const periodSetting = screen.getByText('探索期數').closest('label') as HTMLElement;
  const fixedPeriod = within(periodSetting).getByLabelText('探索期數');
  const stageSection = screen.getByRole('heading', { name: '第一段 探索設定' }).closest('section') as HTMLElement;
  const firstStageCard = screen.getByRole('heading', { name: '第一段 探索設定' }).closest('.tiangong-stage-block') as HTMLElement;
  const firstPosition = within(firstStageCard).getByRole('group', { name: '探索球位' });
  const firstRoad = within(firstStageCard).getByRole('group', { name: '版路類型' });
  expect(document.querySelector('.matrix-tiangong-screen')?.classList.contains('matrix-explore-layout')).toBe(true);
  expect(fixedPeriod.tagName).toBe('OUTPUT');
  expect(fixedPeriod.textContent).toBe('五十期');
  expect(fixedPeriod.classList.contains('segmented-static')).toBe(true);
  expect(within(periodSetting).queryByRole('button')).toBeNull();
  expect(periodSetting.querySelector('button, a, input, select, textarea, [tabindex]')).toBeNull();
  expect(generalCard).not.toBe(stageSection);
  expect(generalCard.contains(firstPosition)).toBe(false);
  expect(generalCard.contains(firstRoad)).toBe(false);
  expect(firstStageCard.contains(firstPosition)).toBe(true);
  expect(firstStageCard.contains(firstRoad)).toBe(true);
  expect(screen.getByRole('heading', { name: '第二段 探索設定' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: '進階探索設定' })).toBeNull();
  expect(screen.queryByText('探索模式')).toBeNull();
  expect(screen.queryByText('命中條件')).toBeNull();
  expect(screen.queryByRole('button', { name: '一段式' })).toBeNull();
  expect(screen.queryByRole('button', { name: '準3進4' })).toBeNull();
  expect(screen.queryByText('近10期開獎號碼')).toBeNull();
  expect(screen.queryByText('連準篩選')).toBeNull();
  expect(within(generalCard).getByRole('group', { name: '探索球位' }).classList.contains('tiangong-setting-row')).toBe(true);
  expect(firstPosition.classList.contains('tiangong-setting-row')).toBe(true);
  expect(firstRoad.classList.contains('tiangong-setting-row')).toBe(true);
  expect(document.querySelector('.tiangong-settings fieldset')).toBeNull();
});

test('依附件演算法支援的篩選條件提交請求', async () => {
  render(<MatrixTiangongPage onNavigate={vi.fn()} />);
  expect(screen.queryByRole('button', { name: '八十期' })).toBeNull();
  fireEvent.click(screen.getAllByRole('button', { name: '由左至右' })[0]);
  const secondStageTitle = screen.getByRole('heading', { name: '第二段 探索設定' });
  const firstStageCard = screen.getByRole('heading', { name: '第一段 探索設定' }).closest('section');
  expect(firstStageCard?.contains(secondStageTitle)).toBe(true);
  expect(screen.getAllByRole('group', { name: '探索球位' })).toHaveLength(3);
  fireEvent.click(screen.getByRole('button', { name: '開始天工' }));

  expect(await screen.findByRole('button', {name:/展開版路/})).toBeTruthy();
  expect(matrixApi.fetchTiangongList).toHaveBeenCalledWith(expect.objectContaining({
    lottery: '今彩539', periodRange: 50,
    mode: 'two-stage', hitCondition: '準2進3',
    exploreDirections: ['固定', '依序遞增'],
    firstStageDirections: ['固定'], firstRoadTypes: ['加減'],
    secondStageDirections: ['固定'], secondRoadTypes: ['加減'],
  }));
});

test('API 結果取代固定範例，展開時才讀取驗證', async () => {
  render(<MatrixTiangongPage onNavigate={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: '開始天工' }));
  expect(await screen.findByText('加減合值')).toBeTruthy();
  expect(screen.getByText('2')).toBeTruthy();
  expect(screen.getByText('3')).toBeTruthy();
  expect(screen.queryByText('08.37')).toBeNull();
  expect(matrixApi.fetchTiangongValidation).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: /展開版路/ }));
  expect(matrixApi.fetchTiangongValidation).toHaveBeenCalledWith(
    expect.objectContaining({ drawPeriod: '114000123', analysisVersion: '114000123:v1' }),
    'tg-api-1',
  );
  expect(await screen.findByText('114100')).toBeTruthy();
  expect(screen.getByText('114109')).toBeTruthy();
  expect(screen.getByText('114114')).toBeTruthy();
  expect(screen.queryByText('114091')).toBeNull();
  expect(screen.queryByText('114101')).toBeNull();
  expect(document.querySelectorAll('.explore-validation-issue')).toHaveLength(3);
  expect(document.querySelectorAll('.explore-validation-issue, .explore-validation-number-row, .explore-validation-formula-row')).toHaveLength(9);
});

test('未完成分析時只顯示狀態，不回退固定資料', async () => {
  matrixApi.fetchTiangongList.mockRejectedValue({ code: 'ANALYSIS_NOT_READY' });
  render(<MatrixTiangongPage onNavigate={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: '開始天工' }));
  expect((await screen.findByRole('alert')).textContent).toBe('分析中，請稍後再試');
  expect(screen.queryByText('08.37')).toBeNull();
});

test('未登入時顯示登入要求，而非泛用 API 錯誤', async () => {
  matrixApi.fetchTiangongList.mockRejectedValue({ code: 'AUTH_REQUIRED' });
  render(<MatrixTiangongPage onNavigate={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: '開始天工' }));

  const dialog = await screen.findByRole('dialog', { name: '請先登入' });
  expect(dialog.textContent).toContain('請先登入後再使用 Matrix 天工');
  expect(document.querySelector('.result-count')).toBeNull();
  fireEvent.click(within(dialog).getByRole('button', { name: '知道了' }));
  expect((await screen.findByRole('alert')).textContent).toBe('請先登入後再使用 Matrix 天工');
});

test('天工載入中不顯示零組，成功空回應才顯示零組', async () => {
  let finish!: (value: unknown) => void;
  matrixApi.fetchTiangongList.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
  render(<MatrixTiangongPage onNavigate={vi.fn()} />);
  const start = screen.getByRole('button', { name: '開始天工' });
  fireEvent.click(start);
  const resultPanel = screen.getByRole('heading', { name: '天工結果區' }).closest('section') as HTMLElement;
  expect(within(resultPanel).getByRole('status').textContent).toBe('分析結果載入中');
  expect(document.querySelector('.result-count')).toBeNull();
  expect((start as HTMLButtonElement).disabled).toBe(true);
  await act(async () => finish({ ...envelope, items: [], total: 0 }));
  expect(within(resultPanel).queryByRole('status')).toBeNull();
  expect(document.querySelector('.result-count')?.textContent?.replace(/\s/g, '')).toBe('探索到0組符合條件版路');
});

test.each(['FORBIDDEN', 'ANALYSIS_NOT_READY', 'API_ERROR'])('天工 %s 不顯示完成結果數量', async code => {
  matrixApi.fetchTiangongList.mockRejectedValueOnce({ code });
  render(<MatrixTiangongPage onNavigate={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: '開始天工' }));
  if (code === 'FORBIDDEN') {
    const dialog = await screen.findByRole('dialog', { name: '無法使用 Matrix 天工' });
    expect(dialog.textContent).toContain('目前 Matrix Pro 方案不符合天工的使用條件');
    fireEvent.click(within(dialog).getByRole('button', { name: '知道了' }));
  }
  await screen.findByRole('alert');
  expect(document.querySelector('.result-count')).toBeNull();
});


test('切換帳號清除已顯示的分析快取並忽略先前未完成請求', async () => {
  updateAlgorithmCacheSession({ access_token: 'account-a', user: { id: 'a' } } as Session);
  render(<MatrixTiangongPage onNavigate={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: '開始天工' }));
  expect(await screen.findByRole('button', { name: /展開版路/ })).toBeTruthy();
  act(() => updateAlgorithmCacheSession(null));
  expect(screen.queryByRole('button', { name: /展開版路/ })).toBeNull();
  act(() => updateAlgorithmCacheSession({ access_token: 'account-b', user: { id: 'b' } } as Session));
  let resolve!: (value: typeof envelope) => void;
  matrixApi.fetchTiangongList.mockReturnValueOnce(new Promise((done) => { resolve = done; }));
  fireEvent.click(screen.getByRole('button', { name: '開始天工' }));
  act(() => updateAlgorithmCacheSession(null));
  await act(async () => { resolve(envelope); });
  expect(screen.queryByRole('button', { name: /展開版路/ })).toBeNull();
});


test('開獎資料更正清除畫面分析快取並忽略晚到的舊分析', async () => {
  render(<MatrixTiangongPage onNavigate={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: '開始天工' }));
  expect(await screen.findByRole('button', { name: /展開版路/ })).toBeTruthy();
  act(() => invalidateMatrixData());
  expect(screen.queryByRole('button', { name: /展開版路/ })).toBeNull();
  let resolve!: (value: typeof envelope) => void;
  matrixApi.fetchTiangongList.mockReturnValueOnce(new Promise((done) => { resolve = done; }));
  fireEvent.click(screen.getByRole('button', { name: '開始天工' }));
  act(() => invalidateMatrixData());
  await act(async () => { resolve(envelope); });
  expect(screen.queryByRole('button', { name: /展開版路/ })).toBeNull();
});

test.each([
  ['breaks_at_stage1', 'D 組第一段計算與開獎號碼不符，此版路可保留。'],
  ['breaks_at_stage2', 'D 組第二段計算與開獎號碼不符，此版路可保留。'],
  ['path_not_extendable', '球位無法延伸至 D 組，此版路可保留。'],
  ['extends_to_near_3_to_4', 'D 組兩段皆符合，已延伸為準3進4，不符合本次準2進3條件。'],
  ['unverifiable', '較早期的開獎資料不足，無法確認 D 組是否符合。'],
  ['future_status', '目前無法解讀 D 組檢查結果，請重新探索。'],
])('D 組檢查 %s 不顯示檢查說明', (status, explanation) => {
  render(<TiangongValidationProcess loading={false} validation={{
    itemId: 'status-copy',
    evidence: { rows: [], d_exclusion: { status } },
  }} />);
  const region = screen.getByRole('region', { name: '天工驗證過程' });
  expect(within(region).queryByText('D 組檢查：' + explanation)).toBeNull();
  expect(region.textContent).not.toContain(status);
});


test('天工列表沿用探索樣式並顯示指定五欄與整列按鈕', async () => {
  render(<MatrixTiangongPage onNavigate={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: '開始天工' }));
  const row = await screen.findByRole('button', { name: /展開版路/ });
  expect(screen.getByRole('heading', { name: '天工結果區' })).toBeTruthy();
  expect([...document.querySelectorAll('.tiangong-results-head > span')].map(x => x.textContent)).toEqual(['間距','位移走向','結果位置','結果','版路類型']);
  expect(row.classList.contains('road-result-row')).toBe(true);
  expect(row.querySelector('.tiangong-interval')?.textContent).toBe('間距2');
  expect(row.querySelector('.tiangong-directions')?.textContent).toBe('固定|固定|固定');
  expect(row.querySelector('.tiangong-position')?.textContent).toBe('第3顆');
  fireEvent.click(within(row).getByText('12'));
  await screen.findByText('114100');
  const formulas = document.querySelectorAll('.explore-validation-formula-row');
  expect(formulas[0].textContent).toBe('第2顆08+4=12');
  expect(formulas[1].textContent).toBe('第3顆12合值28=16');
  expect(formulas[2].textContent).toBe('［ 16 ］');
});

 test.each([1,2,3,4,5,6,7])('版路結果卡顯示號碼與球位 %s', (position) => {
  render(<TiangongValidationProcess loading={false} predictionNumber="28" predictedPosition={position} validation={{itemId:'test', evidence:{rows:[], d_exclusion:{status:'breaks_at_stage1'}}}} />);
  const card = screen.getByText('版路結果').closest('footer')!;
  expect(card.className).toBe('explore-validation-prediction');
  expect(card.textContent).toContain('28');
  expect(card.textContent).toContain(position === 7 ? '特別號' : `第${['一','二','三','四','五','六'][position-1]}顆`);
  expect(screen.queryByText(/D 組檢查/)).toBeNull();
 });

test('天工摘要依兩段資料顯示兩列且沒有連準標籤', () => {
  const value = {period:'115000100', position:4, number:'28', calculated_number:'21', actual_number:'21', matched:true};
  render(<TiangongValidationProcess loading={false} item={{...envelope.items[0], exploreDirection:'依序遞減', secondStageDirection:'依序遞增'}} predictedPosition={3} validation={{itemId:'summary', evidence:{stage1_distance:14,stage2_distance:5,stage1_operation:{type:'add_sub',residue:32},stage2_operation:{type:'sum',value:39},rows:[{group:'A',role:'prediction',source:value,stage1:{...value,position:3},stage2:{...value,position:3}}],d_exclusion:{status:'breaks_at_stage1'}}}} />);
  const summary = screen.getByLabelText('版路摘要');
  const rows = summary.querySelectorAll('.tianyan-validation-summary-row');
  expect(rows).toHaveLength(2);
  expect(rows[0].textContent).toBe('開 28 第 4 顆｜由右至左｜+32｜下 14 期開');
  expect(rows[1].textContent).toBe('開 28 第 3 顆｜由左至右｜合值39｜下 5 期開｜第三顆');
  expect(summary.closest('header')?.querySelector('.explore-validation-consecutive-tag')).toBeNull();
});

test('重複號碼統計依次數排序，同碼及號碼篩選可切換', async () => {
  matrixApi.fetchTiangongList.mockResolvedValue({...envelope,total:4,items:[
    {...envelope.items[0],id:'a',predictionNumber:'28'},
    {...envelope.items[0],id:'b',predictionNumber:'03'},
    {...envelope.items[0],id:'c',predictionNumber:'28'},
    {...envelope.items[0],id:'d',predictionNumber:'03'},
    {...envelope.items[0],id:'e',predictionNumber:'10'},
  ]});
  render(<MatrixTiangongPage onNavigate={vi.fn()} />);
  fireEvent.click(screen.getByRole('button',{name:'開始天工'}));
  await screen.findByRole('button',{name:'篩選結果號碼 03，2次'});
  expect([...document.querySelectorAll('.result-summary b')].map(x=>x.textContent)).toEqual(['03','28','10']);
  fireEvent.click(screen.getByRole('button',{name:'同碼'}));
  expect(document.querySelectorAll('.tiangong-result-row')).toHaveLength(4);
  expect(screen.queryByRole('button',{name:'篩選結果號碼 10，1次'})).toBeNull();
  fireEvent.click(screen.getByRole('button',{name:'篩選結果號碼 28，2次'}));
  expect(document.querySelectorAll('.tiangong-result-row')).toHaveLength(2);
  expect(document.querySelectorAll('.result-summary button')).toHaveLength(2);
  fireEvent.click(screen.getByRole('button',{name:'篩選結果號碼 28，2次'}));
  expect(document.querySelectorAll('.tiangong-result-row')).toHaveLength(4);
  fireEvent.click(screen.getByRole('button',{name:'同碼'}));
  expect(document.querySelectorAll('.tiangong-result-row')).toHaveLength(5);
});

test('驗證順序 C、B、A，A 組只顯示兩列', () => {
  const value={period:'100',position:1,number:'01',actual_number:'01',calculated_number:'01',matched:true};
  render(<TiangongValidationProcess loading={false} validation={{itemId:'groups',evidence:{rows:([
    {group:'C',source:{...value,period:'C1'}},
    {group:'A',source:{...value,period:'A1'}},
    {group:'B',source:{...value,period:'B1'}},
  ] as const).map(row=>({...row,role:'validation',stage1:{...value,period:row.group+'2'},stage2:{...value,period:row.group+'3'}})),d_exclusion:{status:'breaks_at_stage1'}}}} />);
  expect([...document.querySelectorAll('.explore-validation-issue')].map(x=>x.textContent)).toEqual(['C1','C2','C3','B1','B2','B3','A1','A2']);
});
test('同碼依號碼、預測位置、間距升冪排列', async () => {
  const rows=[['a','02',7,2],['b','01',2,8],['c','01',1,9],['d','01',2,3],['e','02',1,9]] as const;
  matrixApi.fetchTiangongList.mockResolvedValue({...envelope,items:rows.map(([id,predictionNumber,predictedPosition,interval])=>({...envelope.items[0],id,predictionNumber,predictedPosition,interval}))});
  render(<MatrixTiangongPage onNavigate={vi.fn()} />);
  fireEvent.click(screen.getByRole('button',{name:'開始天工'}));
  await screen.findByRole('button',{name:'展開版路 a'});
  fireEvent.click(screen.getByRole('button',{name:'同碼'}));
  expect([...document.querySelectorAll('.tiangong-result-row')].map(x=>x.getAttribute('aria-label'))).toEqual(['展開版路 c','展開版路 d','展開版路 b','展開版路 e','展開版路 a']);
});

test('天工每頁15筆，篩選與重新探索都回到第一頁', async () => {
  const items = Array.from({ length: 16 }, (_, i) => ({ ...envelope.items[0], id: `tg-page-${i + 1}`, predictionNumber: i === 15 ? '03' : '12' }));
  matrixApi.fetchTiangongList.mockResolvedValue({ ...envelope, total: 16, items });
  render(<MatrixTiangongPage onNavigate={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: '開始天工' }));
  await screen.findByRole('button', { name: '展開版路 tg-page-1' });
  expect(document.querySelectorAll('.tiangong-result-row')).toHaveLength(15);
  expect(screen.getByRole('button', { name: '天工結果上一頁' }).hasAttribute('disabled')).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: '天工結果下一頁' }));
  expect(document.querySelectorAll('.tiangong-result-row')).toHaveLength(1);
  expect(screen.getByRole('button', { name: '展開版路 tg-page-16' })).toBeTruthy();
  expect(screen.getByRole('button', { name: '天工結果下一頁' }).hasAttribute('disabled')).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: '篩選結果號碼 12，15次' }));
  expect(document.querySelectorAll('.tiangong-result-row')).toHaveLength(15);
  expect(screen.queryByRole('navigation', { name: '天工結果分頁' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: '篩選結果號碼 12，15次' }));
  fireEvent.click(screen.getByRole('button', { name: '天工結果下一頁' }));
  fireEvent.click(screen.getByRole('button', { name: '同碼' }));
  expect(document.querySelectorAll('.tiangong-result-row')).toHaveLength(15);
  expect(screen.queryByRole('navigation', { name: '天工結果分頁' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: '同碼' }));
  fireEvent.click(screen.getByRole('button', { name: '天工結果下一頁' }));
  fireEvent.click(screen.getByRole('button', { name: '開始天工' }));
  await screen.findByRole('button', { name: '展開版路 tg-page-1' });
  expect(document.querySelectorAll('.tiangong-result-row')).toHaveLength(15);
  expect(screen.getByRole('button', { name: '天工結果上一頁' }).hasAttribute('disabled')).toBe(true);
});

test('點擊天工號碼小卡後，完整結果先依預測位置再依間距排序才分頁', async () => {
  const positions = [7, 3, 1, 2, 6, 4];
  const items = positions.flatMap(predictedPosition => [9, 2, 5].map(interval => ({
    ...envelope.items[0], id: `position-${predictedPosition}-gap-${interval}`, predictedPosition, interval,
  })));
  matrixApi.fetchTiangongList.mockResolvedValue({ ...envelope, total: items.length, items });
  render(<MatrixTiangongPage onNavigate={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: '開始天工' }));
  await screen.findByRole('button', { name: '篩選結果號碼 12，18次' });
  fireEvent.click(screen.getByRole('button', { name: '篩選結果號碼 12，18次' }));
  const labels = () => [...document.querySelectorAll('.tiangong-result-row')].map(row => row.getAttribute('aria-label'));
  expect(labels()).toEqual([1, 2, 3, 4, 6].flatMap(position => [2, 5, 9].map(gap => `展開版路 position-${position}-gap-${gap}`)));
  fireEvent.click(screen.getByRole('button', { name: '天工結果下一頁' }));
  expect(labels()).toEqual([2, 5, 9].map(gap => `展開版路 position-7-gap-${gap}`));
  expect(screen.getByRole('button', { name: '篩選結果號碼 12，18次' }).getAttribute('aria-pressed')).toBe('true');
});



test.each(['success', 'failure'])('切換彩種清除天工請求並忽略舊 %s', async outcome => {
  let resolve!: (value: typeof envelope) => void;
  let reject!: (reason: unknown) => void;
  matrixApi.fetchTiangongList.mockReturnValueOnce(new Promise((done, fail) => { resolve = done; reject = fail; }));
  render(<MatrixTiangongPage onNavigate={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: '開始天工' }));
  fireEvent.change(screen.getByRole('combobox', { name: '彩球類型' }), { target: { value: '天天樂' } });
  expect(screen.queryByRole('heading', { name: '天工結果區' })).toBeNull();
  expect((screen.getByRole('button', { name: '開始天工' }) as HTMLButtonElement).disabled).toBe(false);
  await act(async () => { outcome === 'success' ? resolve(envelope) : reject({ code: 'AUTH_REQUIRED' }); });
  expect(screen.queryByRole('button', { name: /展開版路/ })).toBeNull();
  expect(screen.queryByRole('alert')).toBeNull();
  expect(screen.queryByRole('dialog')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: '開始天工' }));
  await screen.findByRole('button', { name: /展開版路/ });
  expect(matrixApi.fetchTiangongList).toHaveBeenLastCalledWith(expect.objectContaining({ lottery: '天天樂' }));
});
