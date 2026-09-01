// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, test, vi } from 'vitest';
import { MatrixCustomStatusPage } from '../FeaturePages';

const statusApi = vi.hoisted(() => ({
  fetchMatrixStatus: vi.fn(), listCustomStatusSettings: vi.fn(), saveCustomStatusSetting: vi.fn(), resetCustomStatusSetting: vi.fn(),
}));
vi.mock('../matrix-status-api', () => statusApi);

beforeEach(() => {
  cleanup();
  statusApi.listCustomStatusSettings.mockReset().mockResolvedValue({ items: [] });
  statusApi.saveCustomStatusSetting.mockReset().mockImplementation(async (config) => ({ item: config }));
  statusApi.resetCustomStatusSetting.mockReset().mockResolvedValue({});
});

test('標題下第一列切彩種、第二列切狀態，並顯示固定探索範圍', async () => {
  render(<MatrixCustomStatusPage onNavigate={vi.fn()} />);
  expect(screen.getByTestId('lottery-switcher').classList.contains('lottery-switcher--home-style')).toBe(true);
  expect(screen.getByRole('tablist', { name: '選擇狀態' })).toBeTruthy();
  expect(screen.getByText('探索期數均為十三期，探索範圍均為完整範圍。')).toBeTruthy();
  expect(await screen.findByText('準4+（鎖定1碼）')).toBeTruthy();
  expect(screen.getByText('準5+（鎖定2碼）')).toBeTruthy();
});

test('沒有自訂設定時依目前狀態呈現第15章預設觸發條件', async () => {
  render(<MatrixCustomStatusPage onNavigate={vi.fn()} />);

  expect(await screen.findByText('目前使用第15章預設觸發條件')).toBeTruthy();
  const activeDefaults = screen.getAllByRole('table', { name: /啟動預設觸發條件/ });
  const activeText = activeDefaults.map((table) => table.textContent).join('');
  expect(activeText).toContain('準5進6～準6進7');
  expect(activeText).toContain('加減＋合值');
  expect(activeText).toContain('順球');
  expect(activeText).toContain('2～4組');

  fireEvent.click(screen.getByRole('tab', { name: /臨界/ }));
  const criticalDefaults = await screen.findAllByRole('table', { name: /臨界預設觸發條件/ });
  const criticalText = criticalDefaults.map((table) => table.textContent).join('');
  expect(criticalText).toContain('準7進8');
  expect(criticalText).toContain('加減＋拖牌');
  expect(criticalText).toContain('2組以上');
  expect(criticalText).toContain('準11進12');
});

test('有自訂設定時顯示自訂組合而不重複顯示第15章預設', async () => {
  statusApi.listCustomStatusSettings.mockResolvedValueOnce({
    items: [{ config: {
      lottery: '今彩539', status: 'ACTIVE', explorePeriods: 13, exploreRange: '完整範圍',
      oneCodeGroups: [{ id: 'custom-one', rows: [{ consecutive: '準6進7', roadType: '合值', numberOrder: '依號碼由小到大排序', sameCodeQuantity: 3 }] }],
      twoCodeGroups: [],
    }, evaluation: {} }],
  });
  render(<MatrixCustomStatusPage onNavigate={vi.fn()} />);

  expect(await screen.findByRole('button', { name: '組合 1 新增條件' })).toBeTruthy();
  expect(screen.queryByText('目前使用第15章預設觸發條件')).toBeNull();
  expect(screen.queryByRole('table', { name: /啟動預設觸發條件/ })).toBeNull();
});

test('可新增組合與列條件，儲存會提交目前彩種與狀態', async () => {
  render(<MatrixCustomStatusPage onNavigate={vi.fn()} />);
  await screen.findByText('準4+（鎖定1碼）');
  fireEvent.click(screen.getByRole('button', { name: '新增一碼觸發條件組合' }));
  fireEvent.click(screen.getByRole('button', { name: '組合 1 新增條件' }));
  expect(screen.getAllByLabelText('同碼數量')).toHaveLength(2);
  fireEvent.change(screen.getByLabelText('組合 1 條件 2 版路類型'), { target: { value: '合值' } });
  fireEvent.click(screen.getByRole('button', { name: '儲存設定' }));
  await waitFor(() => expect(statusApi.saveCustomStatusSetting).toHaveBeenCalledWith(expect.objectContaining({ lottery: '今彩539', status: 'ACTIVE', explorePeriods: 13, exploreRange: '完整範圍' })));
});

test('同組完全相同的列不能重複', async () => {
  render(<MatrixCustomStatusPage onNavigate={vi.fn()} />);
  await screen.findByText('準4+（鎖定1碼）');
  fireEvent.click(screen.getByRole('button', { name: '新增一碼觸發條件組合' }));
  fireEvent.click(screen.getByRole('button', { name: '組合 1 新增條件' }));
  fireEvent.click(screen.getByRole('button', { name: '儲存設定' }));
  expect((await screen.findByRole('alert')).textContent).toBe('同一組合不能有完全相同的條件');
  expect(statusApi.saveCustomStatusSetting).not.toHaveBeenCalled();
});

test('重置只恢復目前彩種與狀態的第15章預設', async () => {
  render(<MatrixCustomStatusPage onNavigate={vi.fn()} />);
  await screen.findByText('準4+（鎖定1碼）');
  fireEvent.click(screen.getByRole('button', { name: '重置設定' }));
  await waitFor(() => expect(statusApi.resetCustomStatusSetting).toHaveBeenCalledWith('今彩539', 'ACTIVE'));
});

test('較早欄位的延遲儲存回應不會覆蓋目前欄位的編輯', async () => {
  let resolveSave: (() => void) | undefined;
  statusApi.saveCustomStatusSetting.mockImplementationOnce((config) => new Promise((resolve) => {
    resolveSave = () => resolve({ item: config });
  }));
  render(<MatrixCustomStatusPage onNavigate={vi.fn()} />);
  await screen.findByText('準4+（鎖定1碼）');
  fireEvent.click(screen.getByRole('button', { name: '新增一碼觸發條件組合' }));
  fireEvent.click(screen.getByRole('button', { name: '儲存設定' }));
  fireEvent.click(screen.getByRole('tab', { name: /聚合/ }));
  fireEvent.click(screen.getByRole('button', { name: '新增一碼觸發條件組合' }));
  await act(async () => { resolveSave?.(); });
  expect(screen.getByRole('button', { name: '組合 1 新增條件' })).toBeTruthy();
});
