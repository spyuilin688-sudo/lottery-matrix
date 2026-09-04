// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, test, vi } from 'vitest';
import { MatrixExplorePage, TongXingPage } from '../FeaturePages';
import { resetReadCacheForTests } from '../read-cache';

const matrixApi = vi.hoisted(() => ({
  fetchExploreList: vi.fn(),
  fetchExploreValidation: vi.fn(),
}));

vi.mock('../matrix-algorithm-api', () => matrixApi);

const exploreEnvelope = {
  kind: 'explore',
  lottery: '今彩539',
  drawPeriod: '114000123',
  analysisVersion: '114000123:v1',
  status: 'complete',
  total: 1,
  duplicateStats: [{ number: '22', count: 1 }, { number: '26', count: 1 }],
  items: [{
    id: 'api-item-1',
    number: '44',
    lockedPosition: 2,
    predictionDistance: 3,
    consecutive: '準5進6',
    highestStreak: 5,
    predictionNumbers: ['22', '26'],
    algorithmType: '加減',
    numberOrder: '依號碼由小到大排序',
    explorePeriods: 13,
    exploreDateOffset: 0,
    ruleCount: 1,
    referenceOffset: -7,
    referencePosition: 4,
  }],
} as const;

const exploreValidationEnvelope = {
  kind: 'explore',
  lottery: '今彩539',
  drawPeriod: '114000123',
  analysisVersion: '114000123:v1',
  status: 'complete',
  itemId: 'api-item-1',
  validation: {
    itemId: 'api-item-1',
    sourceA: {
      sourcePeriod: '114000123',
      sourceNumbers: ['04', '11', '20', '28', '44'],
      sourceSortedNumbers: ['04', '11', '20', '28', '44'],
      sourceDrawOrderNumbers: null,
      referencePeriod: '114000116',
      referenceNumbers: ['02', '09', '14', '21', '35'],
      referenceSortedNumbers: ['02', '09', '14', '21', '35'],
      referenceDrawOrderNumbers: null,
      baseNumber: 14,
      predictionPeriod: null,
      predictionCompleted: false,
    },
    ruleSets: [{
      rules: [{ value: 8, display: '+8', algorithmType: '加減' }],
      predictionNumbers: [22, 26],
      historicalValidation: [{
        group: 'B',
        sourcePeriod: '114000120',
        sourceNumbers: ['03', '10', '14', '22', '31'],
        sourceSortedNumbers: ['03', '10', '14', '22', '31'],
        sourceDrawOrderNumbers: null,
        referencePeriod: '114000118',
        referenceNumbers: ['01', '08', '14', '24', '30'],
        referenceSortedNumbers: ['01', '08', '14', '24', '30'],
        referenceDrawOrderNumbers: null,
        baseNumber: 14,
        predictionPeriod: '114000123',
        predictionNumbers: ['22', '26'],
        candidateRules: [8],
        matchedRules: [{ algorithmType: '加減', value: 8, display: '+8' }],
        hitNumbers: ['22'],
        success: true,
      }],
    }],
  },
} as const;

beforeEach(() => {
  document.body.innerHTML = '';
  window.localStorage.clear();
  window.sessionStorage.clear();
  resetReadCacheForTests();
  HTMLElement.prototype.scrollIntoView = vi.fn();
  matrixApi.fetchExploreList.mockReset().mockResolvedValue(exploreEnvelope);
  matrixApi.fetchExploreValidation.mockReset().mockResolvedValue(exploreValidationEnvelope);
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ records: [] }),
  }) as typeof fetch;
});

test('Matrix 天衍移除近10期但保留 Matrix 探索頁布局', () => {
  render(<MatrixExplorePage onNavigate={vi.fn()} title="Matrix 天衍" roadTypes={['複合版路']} />);

  expect(document.querySelector('.matrix-tianyan-screen')?.classList.contains('matrix-explore-layout')).toBe(true);
  expect(document.querySelectorAll('.matrix-tianyan-screen .matrix-explore-setting-icon')).toHaveLength(3);
  expect(screen.queryByText('近10期開獎號碼')).toBeNull();
  expect(screen.queryByRole('button', { name: /近10期開獎號碼/ })).toBeNull();
  expect(document.querySelector('.matrix-tianyan-screen .history-panel')).toBeNull();

  fireEvent.change(screen.getByRole('combobox', { name: '彩種' }), { target: { value: '六合彩' } });
  expect(screen.queryByText('近10期開獎號碼')).toBeNull();
  expect(document.querySelector('.matrix-tianyan-screen .history-panel')).toBeNull();
});

test('Matrix 同星移除近10期卡片並可收合探索設定', () => {
  render(<TongXingPage onNavigate={vi.fn()} />);

  expect(screen.queryByText('近10期開獎號碼')).toBeNull();
  expect(screen.getByRole('region', { name: '同星探索設定' })).not.toBeNull();

  fireEvent.click(screen.getByRole('button', { name: '收合同星探索設定' }));
  expect(screen.queryByRole('region', { name: '同星探索設定' })).toBeNull();
  expect(screen.getByRole('button', { name: '展開同星探索設定' })).not.toBeNull();
});

test('Matrix 同星開始探索後收合，再展開時固定為浮動設定卡', async () => {
  const mobilePage = document.createElement('div');
  mobilePage.className = 'mobile-page';
  const root = document.createElement('div');
  mobilePage.append(root);
  document.body.append(mobilePage);
  Object.defineProperty(mobilePage, 'offsetWidth', { configurable: true, value: 390 });
  vi.spyOn(mobilePage, 'getBoundingClientRect').mockReturnValue({ top: 20, width: 195 } as DOMRect);
  globalThis.fetch = vi.fn().mockImplementation(async (input) => new Response(JSON.stringify(
    String(input).includes('/latest/')
      ? { period: '114001', numbers: ['01', '02', '03', '04', '05'] }
      : { items: [] },
  ), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })) as typeof fetch;

  render(<TongXingPage onNavigate={vi.fn()} />, { container: root });
  const header = mobilePage.querySelector<HTMLElement>('.feature-brand-header');
  vi.spyOn(header!, 'getBoundingClientRect').mockReturnValue({ bottom: 120 } as DOMRect);

  fireEvent.click(screen.getByRole('button', { name: '開始探索' }));
  await waitFor(() => expect(screen.getByRole('button', { name: '展開同星探索設定' })).not.toBeNull());

  fireEvent.click(screen.getByRole('button', { name: '展開同星探索設定' }));
  const dialog = screen.getByRole('dialog', { name: '同星探索設定' });
  expect(dialog.getAttribute('data-floating')).toBe('true');
  expect(dialog.parentElement).toBe(mobilePage);
  expect(dialog.style.top).toBe('128px');
});

test('Matrix 同星三個輸入框限定 01 到 49、可暫存 0、失焦補零、不重複且點擊全選', () => {
  render(<TongXingPage onNavigate={vi.fn()} />);

  const first = screen.getByRole('textbox', { name: '號碼 1' }) as HTMLInputElement;
  const second = screen.getByRole('textbox', { name: '號碼 2' }) as HTMLInputElement;

  fireEvent.change(first, { target: { value: '0' } });
  expect(first.value).toBe('0');
  fireEvent.blur(first);
  expect(first.value).toBe('');

  fireEvent.change(first, { target: { value: '8' } });
  fireEvent.blur(first);
  expect(first.value).toBe('08');
  fireEvent.click(first);
  expect(first.selectionStart).toBe(0);
  expect(first.selectionEnd).toBe(2);

  fireEvent.change(first, { target: { value: '00' } });
  expect(first.value).toBe('');
  fireEvent.change(first, { target: { value: '50' } });
  expect(first.value).toBe('');
  fireEvent.change(first, { target: { value: '123' } });
  expect(first.value).toBe('12');

  fireEvent.change(second, { target: { value: '12' } });
  expect(second.value).toBe('');
  fireEvent.change(first, { target: { value: '01' } });
  fireEvent.change(second, { target: { value: '1' } });
  fireEvent.blur(second);
  expect(second.value).toBe('');
});

test('Matrix 同星探索結果左欄期數在上、日期在下', async () => {
  globalThis.fetch = vi.fn().mockImplementation(async (input) => {
    const url = String(input);
    const data = url.includes('/latest/')
      ? { period: '114002', drawDate: '2026/08/21', numbers: ['06', '07', '08', '09', '10'] }
      : { items: [
          { period: '114002', drawDate: '2026/08/21', numbers: ['06', '07', '08', '09', '10'] },
          { period: '114001', drawDate: '2026/08/20', numbers: ['01', '02', '03', '04', '05'] },
        ] };
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;

  render(<TongXingPage onNavigate={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: '開始探索' }));

  await waitFor(() => expect(document.querySelectorAll('.tongxing-period-cell')).toHaveLength(2));
  for (const cell of document.querySelectorAll('.tongxing-period-cell')) {
    expect(cell.children[0]?.tagName).toBe('STRONG');
    expect(cell.children[1]?.tagName).toBe('TIME');
  }
});

test('近10期開獎號碼剛進頁面時保持展開', () => {
  render(<MatrixExplorePage onNavigate={vi.fn()} />);

  const toggle = screen.getByRole('button', { name: '收合近10期開獎號碼' });
  const table = document.querySelector<HTMLElement>('.history-table');

  expect(toggle.getAttribute('aria-expanded')).toBe('true');
  expect(toggle.getAttribute('aria-controls')).toBe('matrix-explore-history-table');
  expect(toggle.textContent).toContain('近10期開獎號碼');
  expect(toggle.textContent).not.toContain('依號碼由小到大排序');
  expect(toggle.querySelector('.section-title')).not.toBeNull();
  expect(toggle.querySelector('h2')).toBeNull();
  expect(table?.hidden).toBe(false);
});

test('近10期開獎號碼可用收合按鍵切換顯示狀態', () => {
  render(<MatrixExplorePage onNavigate={vi.fn()} />);

  fireEvent.click(screen.getByRole('button', { name: '收合近10期開獎號碼' }));

  expect(screen.getByRole('button', { name: '展開近10期開獎號碼' }).getAttribute('aria-expanded')).toBe('false');
  expect(document.querySelector<HTMLElement>('.history-table')?.hidden).toBe(true);
});

test('開始探索後自動收合近10期開獎號碼', () => {
  render(<MatrixExplorePage onNavigate={vi.fn()} />);

  fireEvent.click(screen.getByRole('button', { name: '開始探索' }));

  expect(screen.getByRole('button', { name: '展開近10期開獎號碼' }).getAttribute('aria-expanded')).toBe('false');
  expect(document.querySelector<HTMLElement>('.history-table')?.hidden).toBe(true);
});

test('切換彩種時自動展開近10期開獎號碼', () => {
  render(<MatrixExplorePage onNavigate={vi.fn()} />);

  fireEvent.click(screen.getByRole('button', { name: '收合近10期開獎號碼' }));
  fireEvent.change(screen.getByRole('combobox', { name: '彩種' }), { target: { value: '六合彩' } });

  expect(screen.getByRole('button', { name: '收合近10期開獎號碼' }).getAttribute('aria-expanded')).toBe('true');
  expect(document.querySelector<HTMLElement>('.history-table')?.hidden).toBe(false);
});

test('近10期會預留 API 重複資料的去重空間並顯示完整 10 期', async () => {
  const uniqueRecords = Array.from({ length: 10 }, (_, index) => ({
    period: String(11974 - index),
    drawDate: `2026-08-${String(20 - index).padStart(2, '0')}`,
    numbers: ['01', '02', '03', '04', '05'],
  }));
  const duplicateHeavyRecords = uniqueRecords.flatMap((record, index) => (
    index < 5 ? Array.from({ length: 6 }, () => record) : Array.from({ length: 4 }, () => record)
  ));

  globalThis.fetch = vi.fn().mockImplementation(async (input) => {
    const requestUrl = new URL(String(input));
    if (requestUrl.pathname.includes('/latest/')) {
      return new Response(JSON.stringify(uniqueRecords[0]), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    const limit = Number(requestUrl.searchParams.get('limit'));
    return new Response(JSON.stringify({ items: duplicateHeavyRecords.slice(0, limit) }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;

  render(<MatrixExplorePage onNavigate={vi.fn()} />);

  await waitFor(() => {
    expect(document.querySelectorAll('.history-row:not(.history-head)')).toHaveLength(10);
  });
  expect(globalThis.fetch).toHaveBeenCalledWith(
    expect.stringContaining('/history/%E4%BB%8A%E5%BD%A9539?limit=50'),
    expect.anything(),
  );
});


test('展開版路後套用獨立結果區並完整顯示 API 驗證過程', async () => {
  render(<MatrixExplorePage onNavigate={vi.fn()} />);

  fireEvent.click(screen.getByRole('button', { name: '開始探索' }));
  expect(await screen.findByText('22.26')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: /展開版路/ }));

  expect((await screen.findAllByText('+8')).length).toBeGreaterThan(0);
  const validation = screen.getByRole('region', { name: '驗證過程' });
  expect(validation.querySelector('.explore-validation-summary')?.textContent).toBe('開 44 第 2 顆 ｜ 上 7 期 ｜ 第 4 顆 ｜ +8 ｜ 下 3 期開');
  expect(validation.querySelectorAll('.explore-validation-summary-separator')).toHaveLength(4);
  expect(validation.querySelector('.explore-validation-consecutive-tag')?.textContent).toBe('準5進6');
  const blocks = validation.querySelectorAll('.explore-validation-group');
  expect(blocks[0].children).toHaveLength(3);
  expect(blocks[0].getAttribute('data-row-count')).toBe('3');
  expect([...blocks[0].querySelectorAll('.explore-validation-issues .explore-validation-issue')].map((cell) => cell.textContent)).toEqual([
    '114118', '114120', '114123',
  ]);
  expect(blocks[0].querySelectorAll('.explore-validation-formula-row')[0]?.textContent).toBe('第4顆14+8=22');
  expect(blocks[0].querySelectorAll('.explore-validation-formula-row')[2]?.textContent).toBe('［ 22 ］');
  expect(blocks[0].querySelector('.explore-validation-result-number')?.textContent).toBe('22');
  expect([...blocks[1].querySelectorAll('.explore-validation-issues .explore-validation-issue')].map((cell) => cell.textContent)).toEqual([
    '114116', '114123',
  ]);
  const validationRows = validation.querySelectorAll('.explore-validation-group')[0].querySelectorAll('.explore-validation-number-row');
  expect(validationRows[0].querySelector('.explore-validation-number--source')?.textContent).toBe('14');
  expect(validationRows[2].querySelector('.explore-validation-number--step')?.textContent).toBe('22');
  expect(validation.querySelectorAll('.explore-validation-group')[1].querySelector('.explore-validation-number--hit')?.textContent).toBe('44');
  expect(validation.querySelectorAll('.explore-validation-number').length).toBeGreaterThan(0);
  expect(validation.textContent).toContain('本期預測');
  expect(validation.querySelector('.explore-validation-prediction-arrow--left')).not.toBeNull();
  expect(validation.querySelector('.explore-validation-prediction-arrow--right')).not.toBeNull();
});

test('同期驗證會合併鎖定與驗證列並顯示鎖定與命中顏色', async () => {
  matrixApi.fetchExploreList.mockResolvedValue({
    ...exploreEnvelope,
    items: [{ ...exploreEnvelope.items[0], referenceOffset: 0 }],
  });
  matrixApi.fetchExploreValidation.mockResolvedValue({
    ...exploreValidationEnvelope,
    validation: {
      ...exploreValidationEnvelope.validation,
      ruleSets: [{
        ...exploreValidationEnvelope.validation.ruleSets[0],
        historicalValidation: [{
          ...exploreValidationEnvelope.validation.ruleSets[0].historicalValidation[0],
          sourcePeriod: '114000120',
          sourceNumbers: ['03', '10', '14', '22', '44'],
          referencePeriod: '114000120',
          referenceNumbers: ['03', '10', '14', '22', '44'],
          baseNumber: 44,
        }],
      }],
    },
  });
  render(<MatrixExplorePage onNavigate={vi.fn()} />);

  fireEvent.click(screen.getByRole('button', { name: '開始探索' }));
  fireEvent.click(await screen.findByRole('button', { name: /展開版路/ }));

  const validation = await screen.findByRole('region', { name: '驗證過程' });
  expect(validation.querySelector('.explore-validation-summary .validation-summary-position')?.textContent).toBe('2');
  expect([...validation.querySelectorAll('.explore-validation-summary .validation-summary-position')].some((node) => node.textContent === '同期')).toBe(true);
  const firstGroup = validation.querySelector('.explore-validation-group');
  expect([...firstGroup!.querySelectorAll('.explore-validation-issue')].map((cell) => cell.textContent)).toEqual([
    '114120', '114123',
  ]);
  expect(firstGroup!.querySelectorAll('.explore-validation-number-row')).toHaveLength(2);
  expect(firstGroup!.querySelectorAll('.explore-validation-number--hit')).toHaveLength(1);
  expect(firstGroup!.querySelector('.explore-validation-number--source')).toBeNull();
  expect(firstGroup!.querySelector('.explore-validation-number--step')?.textContent).toBe('22');
  expect(validation.querySelectorAll('.explore-validation-group')[1].querySelector('.explore-validation-number--hit')?.textContent).toBe('44');
});

test('拖牌多個驗證值時只保留一列空白公式列且每組最多三列', async () => {
  matrixApi.fetchExploreList.mockResolvedValue({
    ...exploreEnvelope,
    items: [{ ...exploreEnvelope.items[0], algorithmType: '拖牌' }],
  });
  matrixApi.fetchExploreValidation.mockResolvedValue({
    ...exploreValidationEnvelope,
    validation: {
      ...exploreValidationEnvelope.validation,
      ruleSets: [{
        ...exploreValidationEnvelope.validation.ruleSets[0],
        rules: [
          { value: 14, display: '拖牌14', algorithmType: '拖牌' },
          { value: 24, display: '拖牌24', algorithmType: '拖牌' },
          { value: 34, display: '拖牌34', algorithmType: '拖牌' },
        ],
        historicalValidation: [{
          ...exploreValidationEnvelope.validation.ruleSets[0].historicalValidation[0],
          candidateRules: [14, 24, 34],
          matchedRules: [
            { algorithmType: '拖牌', value: 14, display: '拖牌14' },
            { algorithmType: '拖牌', value: 24, display: '拖牌24' },
            { algorithmType: '拖牌', value: 34, display: '拖牌34' },
          ],
          hitNumbers: ['09', '28', '38'],
        }],
      }],
    },
  });
  render(<MatrixExplorePage onNavigate={vi.fn()} />);

  fireEvent.click(screen.getByRole('button', { name: '拖牌版路推薦' }));
  fireEvent.click(screen.getByRole('button', { name: '開始探索' }));
  fireEvent.click(await screen.findByRole('button', { name: /展開版路/ }));

  const validation = await screen.findByRole('region', { name: '驗證過程' });
  const firstGroup = validation.querySelector('.explore-validation-group');
  const issues = [...firstGroup!.querySelectorAll('.explore-validation-issue')];
  const numberRows = [...firstGroup!.querySelectorAll('.explore-validation-number-row')];
  const formulas = [...firstGroup!.querySelectorAll('.explore-validation-formula-row')];
  expect(issues.map((cell) => cell.textContent)).toEqual(['114120', '', '114123']);
  expect(numberRows[1].textContent).toBe('');
  expect(formulas[0].textContent).toBe('第4顆14+34=09');
  expect(formulas[1].textContent).toBe('第4顆14+24=38');
  expect(formulas.map((formula) => formula.textContent).join('')).not.toContain('+14');
  expect(firstGroup!.querySelector('.explore-validation-number--source')).toBeNull();
  expect(validation.querySelectorAll('.explore-validation-group')[1].querySelector('.explore-validation-number--hit')?.textContent).toBe('44');
});

test.each(['六合彩', '大樂透'] as const)('%s驗證號碼會在特別號前顯示加號', async (lottery) => {
  const sevenNumbers = ['01', '08', '14', '22', '31', '36', '44'];
  matrixApi.fetchExploreValidation.mockResolvedValue({
    ...exploreValidationEnvelope,
    lottery,
    validation: {
      ...exploreValidationEnvelope.validation,
      sourceA: {
        ...exploreValidationEnvelope.validation.sourceA,
        sourceNumbers: sevenNumbers,
        referenceNumbers: sevenNumbers,
      },
      ruleSets: [{
        ...exploreValidationEnvelope.validation.ruleSets[0],
        historicalValidation: [{
          ...exploreValidationEnvelope.validation.ruleSets[0].historicalValidation[0],
          sourceNumbers: sevenNumbers,
          referenceNumbers: sevenNumbers,
          predictionNumbers: sevenNumbers,
        }],
      }],
    },
  });
  render(<MatrixExplorePage onNavigate={vi.fn()} />);

  fireEvent.change(screen.getByRole('combobox', { name: '彩種' }), { target: { value: lottery } });
  fireEvent.click(screen.getByRole('button', { name: '開始探索' }));
  fireEvent.click(await screen.findByRole('button', { name: /展開版路/ }));

  const validation = await screen.findByRole('region', { name: '驗證過程' });
  expect(validation.querySelectorAll('.explore-validation-special-separator').length).toBeGreaterThan(0);
  expect(validation.querySelector('.explore-validation-special-separator')?.textContent).toBe('+');
  expect(validation.querySelector('.explore-validation-special-number')?.textContent).toMatch(/^\+\d{2}$/);
});

test('驗證期在鎖定條件之後時排列在第二列', async () => {
  matrixApi.fetchExploreList.mockResolvedValue({
    ...exploreEnvelope,
    items: [{ ...exploreEnvelope.items[0], referenceOffset: 2 }],
  });
  matrixApi.fetchExploreValidation.mockResolvedValue({
    ...exploreValidationEnvelope,
    validation: {
      ...exploreValidationEnvelope.validation,
      ruleSets: [{
        ...exploreValidationEnvelope.validation.ruleSets[0],
        historicalValidation: [{
          ...exploreValidationEnvelope.validation.ruleSets[0].historicalValidation[0],
          sourcePeriod: '114000118',
          referencePeriod: '114000120',
        }],
      }],
    },
  });
  render(<MatrixExplorePage onNavigate={vi.fn()} />);

  fireEvent.click(screen.getByRole('button', { name: '開始探索' }));
  fireEvent.click(await screen.findByRole('button', { name: /展開版路/ }));

  const validation = await screen.findByRole('region', { name: '驗證過程' });
  expect(validation.querySelector('.explore-validation-summary')?.textContent).toContain(' ｜ 下 2 期 ｜ ');
  const firstGroup = validation.querySelector('.explore-validation-group');
  const rows = firstGroup?.querySelectorAll('.explore-validation-issues .explore-validation-issue') ?? [];
  expect([...rows].map((row) => row.textContent)).toEqual([
    '114118', '114120', '114123',
  ]);
  const formulas = firstGroup?.querySelectorAll('.explore-validation-formula-row') ?? [];
  expect(formulas[0]?.textContent).toBe('');
  expect(formulas[1]?.textContent).toContain('+8');
  const currentFormulas = validation.querySelectorAll('.explore-validation-group')[1].querySelectorAll('.explore-validation-formula-row');
  expect(currentFormulas[0]?.textContent).toBe('');
  expect(currentFormulas[1]?.textContent).toContain('+8');
});

test('兩條公式同時成立時分別放在驗證號碼列與鎖定條件列', async () => {
  matrixApi.fetchExploreList.mockResolvedValue({
    ...exploreEnvelope,
    items: [{ ...exploreEnvelope.items[0], referenceOffset: 2 }],
  });
  matrixApi.fetchExploreValidation.mockResolvedValue({
    ...exploreValidationEnvelope,
    validation: {
      ...exploreValidationEnvelope.validation,
      ruleSets: [{
        ...exploreValidationEnvelope.validation.ruleSets[0],
        rules: [
          { value: 14, display: '+14', algorithmType: '加減' },
          { value: 24, display: '+24', algorithmType: '加減' },
        ],
        historicalValidation: [{
          ...exploreValidationEnvelope.validation.ruleSets[0].historicalValidation[0],
          sourcePeriod: '114000118',
          referencePeriod: '114000120',
          matchedRules: [
            { algorithmType: '加減', value: 14, display: '+14' },
            { algorithmType: '加減', value: 24, display: '+24' },
          ],
        }],
      }],
    },
  });
  render(<MatrixExplorePage onNavigate={vi.fn()} />);

  fireEvent.click(screen.getByRole('button', { name: '開始探索' }));
  fireEvent.click(await screen.findByRole('button', { name: /展開版路/ }));

  const validation = await screen.findByRole('region', { name: '驗證過程' });
  const firstGroup = validation.querySelector('.explore-validation-group');
  const issues = [...firstGroup!.querySelectorAll('.explore-validation-issue')].map((cell) => cell.textContent);
  const formulas = [...firstGroup!.querySelectorAll('.explore-validation-formula-row')].map((cell) => cell.textContent);
  expect(issues).toEqual(['114118', '114120', '114123']);
  expect(formulas[0]).toContain('+24');
  expect(formulas[1]).toContain('+14');
  expect(formulas[2]).toBe('［ 22 ］');
  expect(formulas.join('')).not.toMatch(/第一|第二/);
});

test('數值相同但類型不同的規則只顯示實際成立公式', async () => {
  matrixApi.fetchExploreValidation.mockResolvedValue({
    ...exploreValidationEnvelope,
    validation: {
      ...exploreValidationEnvelope.validation,
      ruleSets: [{
        ...exploreValidationEnvelope.validation.ruleSets[0],
        rules: [
          { value: 14, display: '+14', algorithmType: '加減' },
          { value: 14, display: '拖牌14', algorithmType: '拖牌' },
        ],
        historicalValidation: [{
          ...exploreValidationEnvelope.validation.ruleSets[0].historicalValidation[0],
          matchedRules: [{ algorithmType: '加減', value: 14, display: '+14' }],
        }],
      }],
    },
  });
  render(<MatrixExplorePage onNavigate={vi.fn()} />);

  fireEvent.click(screen.getByRole('button', { name: '開始探索' }));
  fireEvent.click(await screen.findByRole('button', { name: /展開版路/ }));

  const validation = await screen.findByRole('region', { name: '驗證過程' });
  const firstFormula = validation.querySelector('.explore-validation-group .explore-validation-formula-row')?.textContent ?? '';
  expect(firstFormula).toContain('+14');
  expect(firstFormula).not.toContain('拖牌14');
});

test('舊版數值公式遇到不同類型同值時依目前版路類型解析', async () => {
  matrixApi.fetchExploreValidation.mockResolvedValue({
    ...exploreValidationEnvelope,
    validation: {
      ...exploreValidationEnvelope.validation,
      ruleSets: [{
        ...exploreValidationEnvelope.validation.ruleSets[0],
        rules: [
          { value: 14, display: '+14', algorithmType: '加減' },
          { value: 14, display: '拖牌14', algorithmType: '拖牌' },
        ],
        historicalValidation: [{
          ...exploreValidationEnvelope.validation.ruleSets[0].historicalValidation[0],
          matchedRules: [14],
        }],
      }],
    },
  });
  render(<MatrixExplorePage onNavigate={vi.fn()} />);

  fireEvent.click(screen.getByRole('button', { name: '開始探索' }));
  fireEvent.click(await screen.findByRole('button', { name: /展開版路/ }));

  const validation = await screen.findByRole('region', { name: '驗證過程' });
  const firstFormula = validation.querySelector('.explore-validation-group .explore-validation-formula-row')?.textContent ?? '';
  expect(firstFormula).toContain('+14');
  expect(firstFormula).not.toMatch(/共同值14|拖牌14/);
});

test('舊版數值公式只有一條同值規則時顯示該公式', async () => {
  matrixApi.fetchExploreValidation.mockResolvedValue({
    ...exploreValidationEnvelope,
    validation: {
      ...exploreValidationEnvelope.validation,
      ruleSets: [{
        ...exploreValidationEnvelope.validation.ruleSets[0],
        rules: [{ value: 14, display: '+14', algorithmType: '加減' }],
        historicalValidation: [{
          ...exploreValidationEnvelope.validation.ruleSets[0].historicalValidation[0],
          matchedRules: [14],
        }],
      }],
    },
  });
  render(<MatrixExplorePage onNavigate={vi.fn()} />);

  fireEvent.click(screen.getByRole('button', { name: '開始探索' }));
  fireEvent.click(await screen.findByRole('button', { name: /展開版路/ }));

  const validation = await screen.findByRole('region', { name: '驗證過程' });
  const firstFormula = validation.querySelector('.explore-validation-group .explore-validation-formula-row')?.textContent ?? '';
  expect(firstFormula).toContain('+14');
});

test('合值版路的 API 驗證概要顯示合值規則', async () => {
  matrixApi.fetchExploreList.mockResolvedValue({
    ...exploreEnvelope,
    items: [{ ...exploreEnvelope.items[0], algorithmType: '合值' }],
  });
  matrixApi.fetchExploreValidation.mockResolvedValue({
    ...exploreValidationEnvelope,
    validation: {
      ...exploreValidationEnvelope.validation,
      ruleSets: [{
        ...exploreValidationEnvelope.validation.ruleSets[0],
        rules: [{ value: 36, display: '合值36', algorithmType: '合值' }],
        historicalValidation: [{
          ...exploreValidationEnvelope.validation.ruleSets[0].historicalValidation[0],
          candidateRules: [36],
          matchedRules: [{ algorithmType: '合值', value: 36, display: '合值36' }],
          hitNumbers: ['22'],
        }],
      }],
    },
  });
  render(<MatrixExplorePage onNavigate={vi.fn()} />);

  fireEvent.click(screen.getByRole('button', { name: '合值版路' }));
  fireEvent.click(screen.getByRole('button', { name: '開始探索' }));
  expect(await screen.findByText('22.26')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: /展開版路/ }));

  const validation = await screen.findByRole('region', { name: '驗證過程' });
  expect(validation.querySelector('.explore-validation-summary')?.textContent).toBe('開 44 第 2 顆 ｜ 上 7 期 ｜ 第 4 顆 ｜ 合值36 ｜ 下 3 期開');
  expect(validation.querySelector('.validation-summary-formula-label')?.textContent).toBe('合值');
  expect(validation.querySelector('.explore-validation-formula-row')?.textContent).toBe('第4顆14合值36=22');
});

test('探索結果使用 API 資料而不是固定範例', async () => {
  render(<MatrixExplorePage onNavigate={vi.fn()} />);

  fireEvent.click(screen.getByRole('button', { name: '開始探索' }));

  expect(await screen.findByText('22.26')).toBeTruthy();
  expect(screen.getByRole('button', { name: '同碼' }).getAttribute('aria-pressed')).toBe('false');
  expect(screen.getByText('44')).toBeTruthy();
  expect(screen.queryByText('03.09')).toBeNull();
  expect(matrixApi.fetchExploreList).toHaveBeenCalledWith(expect.objectContaining({
    lottery: '今彩539',
    exploreDateOffset: 0,
    ruleCount: 1,
    roadTypes: ['加減'],
    selectedStreaks: ['準5進6', '準6進7', '準7進8'],
    sameCode: false,
  }));
});

test('探索頁使用單列收合連準篩選並套用兩種命中條件預設值', async () => {
  render(<MatrixExplorePage onNavigate={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: '開始探索' }));

  const disclosure = screen.getByRole('button', { name: '連準篩選' });
  expect(disclosure.getAttribute('aria-expanded')).toBe('false');
  fireEvent.click(disclosure);

  const filter = screen.getByRole('group', { name: '準4+（鎖定1碼）連準篩選' });
  const options = [...filter.querySelectorAll('button')];
  expect(options.map((button) => button.textContent)).toEqual(['準4進5', '準5進6', '準6進7', '準7進8']);
  expect(options.map((button) => button.getAttribute('aria-pressed'))).toEqual(['false', 'true', 'true', 'true']);
  expect(screen.queryByRole('dialog', { name: '連準篩選' })).toBeNull();

  fireEvent.click(screen.getByRole('button', { name: '準5+（鎖定2碼）' }));
  fireEvent.click(screen.getByRole('button', { name: '開始探索' }));
  expect(matrixApi.fetchExploreList).toHaveBeenLastCalledWith(expect.objectContaining({
    selectedStreaks: ['準9進10', '準11進12'],
  }));
});

test('拖牌版路依命中條件使用例外預設連準', async () => {
  render(<MatrixExplorePage onNavigate={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: '拖牌版路推薦' }));
  fireEvent.click(screen.getByRole('button', { name: '開始探索' }));

  await waitFor(() => expect(matrixApi.fetchExploreList).toHaveBeenLastCalledWith(expect.objectContaining({
    roadTypes: ['拖牌'],
    selectedStreaks: ['準5進6', '準6進7', '準7進8'],
  })));

  fireEvent.click(screen.getByRole('button', { name: '準5+（鎖定2碼）' }));
  fireEvent.click(screen.getByRole('button', { name: '開始探索' }));

  await waitFor(() => expect(matrixApi.fetchExploreList).toHaveBeenLastCalledWith(expect.objectContaining({
    roadTypes: ['拖牌'],
    selectedStreaks: ['準6進7', '準7進8', '準9進10', '準11進12'],
  })));
});

test('再次開始探索會清除同碼與號碼篩選並恢復準4+預設連準', async () => {
  render(<MatrixExplorePage onNavigate={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: '開始探索' }));

  fireEvent.click(await screen.findByRole('button', { name: '同碼' }));
  await waitFor(() => expect(matrixApi.fetchExploreList).toHaveBeenLastCalledWith(
    expect.objectContaining({ sameCode: true }),
  ));

  fireEvent.click(screen.getByRole('button', { name: '篩選預測號碼 22，1次' }));
  await waitFor(() => expect(matrixApi.fetchExploreList).toHaveBeenLastCalledWith(
    expect.objectContaining({ predictionNumber: '22' }),
  ));

  fireEvent.click(screen.getByRole('button', { name: '連準篩選' }));
  fireEvent.click(screen.getByRole('button', { name: '準6進7' }));
  await waitFor(() => expect(matrixApi.fetchExploreList).toHaveBeenLastCalledWith(
    expect.objectContaining({ selectedStreaks: ['準5進6', '準7進8'] }),
  ));

  fireEvent.click(screen.getByRole('button', { name: '開始探索' }));

  await waitFor(() => expect(matrixApi.fetchExploreList).toHaveBeenLastCalledWith(
    expect.objectContaining({
      sameCode: false,
      selectedStreaks: ['準5進6', '準6進7', '準7進8'],
    }),
  ));
  expect(matrixApi.fetchExploreList).toHaveBeenLastCalledWith(
    expect.not.objectContaining({ predictionNumber: expect.anything() }),
  );
  expect(screen.getByRole('button', { name: '同碼' }).getAttribute('aria-pressed')).toBe('false');
  expect(screen.getByRole('button', { name: '篩選預測號碼 22，1次' }).getAttribute('aria-pressed')).toBe('false');
  expect(screen.getByRole('button', { name: '準6進7' }).getAttribute('aria-pressed')).toBe('true');
});

test('再次開始探索會恢復準5+預設連準', async () => {
  render(<MatrixExplorePage onNavigate={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: '準5+（鎖定2碼）' }));
  fireEvent.click(screen.getByRole('button', { name: '開始探索' }));
  fireEvent.click(screen.getByRole('button', { name: '連準篩選' }));
  fireEvent.click(screen.getByRole('button', { name: '準9進10' }));

  await waitFor(() => expect(matrixApi.fetchExploreList).toHaveBeenLastCalledWith(
    expect.objectContaining({ selectedStreaks: ['準11進12'] }),
  ));

  fireEvent.click(screen.getByRole('button', { name: '開始探索' }));

  await waitFor(() => expect(matrixApi.fetchExploreList).toHaveBeenLastCalledWith(
    expect.objectContaining({
      sameCode: false,
      selectedStreaks: ['準9進10', '準11進12'],
    }),
  ));
  expect(screen.getByRole('button', { name: '準9進10' }).getAttribute('aria-pressed')).toBe('true');
});

test('探索結果每頁最多顯示15筆並可切換下一頁', async () => {
  const items = Array.from({ length: 16 }, (_, index) => ({
    ...exploreEnvelope.items[0],
    id: `api-item-${index + 1}`,
    number: String((index % 39) + 1).padStart(2, '0'),
  }));
  matrixApi.fetchExploreList.mockResolvedValue({
    ...exploreEnvelope,
    total: 16,
    items,
  });
  render(<MatrixExplorePage onNavigate={vi.fn()} />);

  fireEvent.click(screen.getByRole('button', { name: '開始探索' }));

  await screen.findByRole('button', { name: '展開版路 api-item-1' });
  expect(screen.getAllByRole('button', { name: /展開版路 api-item-/ })).toHaveLength(15);
  expect(screen.queryByRole('button', { name: '展開版路 api-item-16' })).toBeNull();
  expect(document.querySelector('.result-count .numeric-text')?.textContent).toBe('16');

  fireEvent.click(screen.getByRole('button', { name: '探索結果下一頁' }));

  expect(screen.getByRole('button', { name: '展開版路 api-item-16' })).toBeTruthy();
  expect(screen.getAllByRole('button', { name: /展開版路 api-item-/ })).toHaveLength(1);
  expect(screen.getByText('2 / 2')).toBeTruthy();
});

test('排序結果第七球在位置欄顯示特別號', async () => {
  matrixApi.fetchExploreList.mockResolvedValue({
    ...exploreEnvelope,
    items: [{
      ...exploreEnvelope.items[0],
      lockedPosition: 7,
      numberOrder: '依號碼由小到大排序',
    }],
  });
  render(<MatrixExplorePage onNavigate={vi.fn()} />);

  fireEvent.click(screen.getByRole('button', { name: '開始探索' }));

  const resultRow = await screen.findByRole('button', { name: '展開版路 api-item-1' });
  expect(resultRow.querySelector('.tag')?.textContent).toBe('特別號');
});

test('探索結果整列皆可展開驗證過程', async () => {
  render(<MatrixExplorePage onNavigate={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: '開始探索' }));

  const resultRow = await screen.findByRole('button', { name: '展開版路 api-item-1' });
  expect(resultRow.classList.contains('road-result-row')).toBe(true);
  fireEvent.click(resultRow);
  expect(await screen.findByRole('region', { name: '驗證過程' })).toBeTruthy();
});

test('切換已展開結果時將新列重新定位至畫面上方', async () => {
  const scrollIntoView = vi.fn();
  HTMLElement.prototype.scrollIntoView = scrollIntoView;
  matrixApi.fetchExploreList.mockResolvedValue({
    ...exploreEnvelope,
    total: 2,
    items: [
      exploreEnvelope.items[0],
      {
        ...exploreEnvelope.items[0],
        id: 'api-item-2',
        number: '43',
        predictionNumbers: ['20', '25'],
      },
    ],
  });

  render(<MatrixExplorePage onNavigate={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: '開始探索' }));

  const firstRow = await screen.findByRole('button', { name: '展開版路 api-item-1' });
  const secondRow = screen.getByRole('button', { name: '展開版路 api-item-2' });
  fireEvent.click(firstRow);
  expect(scrollIntoView).not.toHaveBeenCalled();

  fireEvent.click(secondRow);

  await waitFor(() => expect(scrollIntoView).toHaveBeenCalledTimes(1));
  expect(scrollIntoView.mock.instances[0]).toBe(secondRow);
  expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });
});

test('探索日期提供本日、昨日與前日', () => {
  render(<MatrixExplorePage onNavigate={vi.fn()} />);

  fireEvent.click(screen.getByRole('button', { name: '進階探索設定' }));

  expect(screen.getByText('本日 (最新)')).toBeTruthy();
  expect(screen.getByText('昨日 (上1期)')).toBeTruthy();
  expect(screen.getByText('前日 (上2期)')).toBeTruthy();
});

test('點擊重複號碼小卡會傳送號碼篩選，再點一次取消', async () => {
  render(<MatrixExplorePage onNavigate={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: '開始探索' }));

  const numberCard = await screen.findByRole('button', { name: '篩選預測號碼 22，1次' });
  expect(numberCard.getAttribute('aria-pressed')).toBe('false');

  fireEvent.click(numberCard);
  await waitFor(() => expect(matrixApi.fetchExploreList).toHaveBeenLastCalledWith(
    expect.objectContaining({ predictionNumber: '22' }),
  ));
  expect(numberCard.getAttribute('aria-pressed')).toBe('true');

  fireEvent.click(numberCard);
  await waitFor(() => expect(matrixApi.fetchExploreList).toHaveBeenLastCalledWith(
    expect.not.objectContaining({ predictionNumber: expect.anything() }),
  ));
  expect(numberCard.getAttribute('aria-pressed')).toBe('false');
});

test('只有展開結果時才讀取該筆驗證資料', async () => {
  render(<MatrixExplorePage onNavigate={vi.fn()} />);

  fireEvent.click(screen.getByRole('button', { name: '開始探索' }));
  expect(await screen.findByText('22.26')).toBeTruthy();
  expect(matrixApi.fetchExploreValidation).not.toHaveBeenCalled();

  fireEvent.click(screen.getByRole('button', { name: /展開版路/ }));

  expect(matrixApi.fetchExploreValidation).toHaveBeenCalledTimes(1);
  expect(matrixApi.fetchExploreValidation).toHaveBeenCalledWith(
    expect.objectContaining({ analysisVersion: '114000123:v1', drawPeriod: '114000123' }),
    'api-item-1',
    expect.objectContaining({ exploreRange: '標準範圍' }),
  );
});

test('Matrix 探索驗證過程在頁面 hidden 時遮蔽、回到前景後還原，且不重新讀取資料', async () => {
  const originalHidden = Object.getOwnPropertyDescriptor(document, 'hidden');
  let hidden = false;
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
  const addEventListener = vi.spyOn(document, 'addEventListener');
  const removeEventListener = vi.spyOn(document, 'removeEventListener');

  try {
    const { unmount } = render(<MatrixExplorePage onNavigate={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: '開始探索' }));
    fireEvent.click(await screen.findByRole('button', { name: /展開版路/ }));

    const validation = await screen.findByRole('region', { name: '驗證過程' });
    const visibilityRegistration = addEventListener.mock.calls.find(([type]) => type === 'visibilitychange');
    expect(visibilityRegistration).toBeDefined();
    expect(validation.getAttribute('data-content-protected')).toBe('false');

    const copy = new Event('copy', { bubbles: true, cancelable: true });
    const drag = new Event('dragstart', { bubbles: true, cancelable: true });
    fireEvent(validation, copy);
    fireEvent(validation, drag);
    expect(copy.defaultPrevented).toBe(true);
    expect(drag.defaultPrevented).toBe(true);

    hidden = true;
    fireEvent(document, new Event('visibilitychange'));
    expect(validation.getAttribute('data-content-protected')).toBe('true');

    hidden = false;
    fireEvent(document, new Event('visibilitychange'));
    expect(validation.getAttribute('data-content-protected')).toBe('false');
    expect(validation.textContent).toContain('本期預測');
    expect(matrixApi.fetchExploreValidation).toHaveBeenCalledTimes(1);

    unmount();
    expect(removeEventListener).toHaveBeenCalledWith('visibilitychange', visibilityRegistration?.[1]);
  } finally {
    if (originalHidden) Object.defineProperty(document, 'hidden', originalHidden);
    else delete (document as { hidden?: boolean }).hidden;
  }
});
