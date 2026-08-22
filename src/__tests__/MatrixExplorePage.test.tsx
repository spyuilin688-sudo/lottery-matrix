// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, test, vi } from 'vitest';
import { MatrixExplorePage, TongXingPage } from '../FeaturePages';

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
    ruleSets: [{
      rules: [{ value: 14.24, display: '+14.24', algorithmType: '加減' }],
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
        candidateRules: [14.24],
        matchedRules: [14.24],
        hitNumbers: ['22'],
        success: true,
      }],
    }],
  },
} as const;

beforeEach(() => {
  document.body.innerHTML = '';
  window.sessionStorage.clear();
  HTMLElement.prototype.scrollIntoView = vi.fn();
  matrixApi.fetchExploreList.mockReset().mockResolvedValue(exploreEnvelope);
  matrixApi.fetchExploreValidation.mockReset().mockResolvedValue(exploreValidationEnvelope);
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ records: [] }),
  }) as typeof fetch;
});

test('Matrix 天衍的近10期與探索頁使用相同展開行為', () => {
  render(<MatrixExplorePage onNavigate={vi.fn()} title="Matrix 天衍" roadTypes={['複合版路']} />);

  expect(screen.getByRole('button', { name: '收合近10期開獎號碼' })).not.toBeNull();
  expect(document.querySelector('.history-panel')?.classList.contains('matrix-explore-history-panel')).toBe(true);

  fireEvent.click(screen.getByRole('button', { name: '開始探索' }));
  expect(screen.getByRole('button', { name: '展開近10期開獎號碼' })).not.toBeNull();

  fireEvent.change(screen.getByRole('combobox', { name: '彩種' }), { target: { value: '六合彩' } });
  expect(screen.getByRole('button', { name: '收合近10期開獎號碼' })).not.toBeNull();
  expect(document.querySelector('.history-panel-order')).toBeNull();
});

test('Matrix 同星移除近10期卡片並可收合探索設定', () => {
  render(<TongXingPage onNavigate={vi.fn()} />);

  expect(screen.queryByText('近10期開獎號碼')).toBeNull();
  expect(screen.getByRole('region', { name: '同星探索設定' })).not.toBeNull();

  fireEvent.click(screen.getByRole('button', { name: '收合同星探索設定' }));
  expect(screen.queryByRole('region', { name: '同星探索設定' })).toBeNull();
  expect(screen.getByRole('button', { name: '展開同星探索設定' })).not.toBeNull();
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
    const data = url.endsWith('/api/matrix/tongxing')
      ? {
          lottery: '今彩539',
          numberOrder: '依號碼由小到大排序',
          numbers: [],
          futureOffset: 1,
          groups: [{
            lockedEntry: { period: '114001', drawDate: '2026/08/20', numbers: ['01', '02', '03', '04', '05'] },
            predictedEntry: { period: '114002', drawDate: '2026/08/21', numbers: ['06', '07', '08', '09', '10'] },
          }],
        }
      : { items: [] };
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


test('展開版路後以 API 規則與可分色數字顯示驗證概要', async () => {
  render(<MatrixExplorePage onNavigate={vi.fn()} />);

  fireEvent.click(screen.getByRole('button', { name: '開始探索' }));
  expect(await screen.findByText('22.26')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: /展開版路/ }));

  expect(await screen.findByText('+14.24')).toBeTruthy();
  const validation = screen.getByRole('region', { name: '驗證過程' });
  expect(validation.querySelector('.validation-summary-card')?.textContent).toBe('+14.24');
  expect(validation.querySelectorAll('.validation-full-numbers i').length).toBeGreaterThan(0);
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
        rules: [{ value: 14.24, display: '合值14.24', algorithmType: '合值' }],
      }],
    },
  });
  render(<MatrixExplorePage onNavigate={vi.fn()} />);

  fireEvent.click(screen.getByRole('button', { name: '合值版路' }));
  fireEvent.click(screen.getByRole('button', { name: '開始探索' }));
  expect(await screen.findByText('22.26')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: /展開版路/ }));

  expect(await screen.findByText('合值14.24')).toBeTruthy();
});

test('探索結果使用 API 資料而不是固定範例', async () => {
  render(<MatrixExplorePage onNavigate={vi.fn()} />);

  fireEvent.click(screen.getByRole('button', { name: '開始探索' }));

  expect(await screen.findByText('22.26')).toBeTruthy();
  expect(screen.getByText('44')).toBeTruthy();
  expect(screen.queryByText('03.09')).toBeNull();
  expect(matrixApi.fetchExploreList).toHaveBeenCalledWith(expect.objectContaining({
    lottery: '今彩539',
    explorePeriods: 13,
    ruleCount: 1,
    roadTypes: ['加減'],
  }));
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
  );
});
