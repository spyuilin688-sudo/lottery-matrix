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
  expect(screen.getByRole('radiogroup', { name: '選擇彩種' })).toBeTruthy();
  expect(screen.getByRole('tablist', { name: '選擇狀態' })).toBeTruthy();
  expect(screen.getByText('探索期數均為十三期，探索範圍均為完整範圍。')).toBeTruthy();
  expect(await screen.findByText('準4+（鎖定1碼）')).toBeTruthy();
  expect(screen.getByText('準5+（鎖定2碼）')).toBeTruthy();
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
