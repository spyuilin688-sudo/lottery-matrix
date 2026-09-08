// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, expect, test, vi } from 'vitest';
import { render } from '../../test/render-with-dialog';
import { MatrixNotebookPage } from '../features/NotebookPages';

const notes = [
  { id: 'note-a', title: '第一張筆記', content: '保留第一張內容', updatedAt: '2026-09-08T10:00:00Z' },
  { id: 'note-b', title: '第二張筆記', content: '第二張內容', updatedAt: '2026-09-08T11:00:00Z' },
];

beforeEach(() => {
  window.localStorage.clear();
  window.localStorage.setItem('matrix-notebook-entries', JSON.stringify(notes));
});

test('delete is a toolbar action; selecting a note confirms only that note', async () => {
  const { container } = render(<MatrixNotebookPage onNavigate={vi.fn()} />);
  expect(container.querySelector('.notebook-heading h2')).toBeNull();
  const toolbarDelete = screen.getByRole('button', { name: '刪除' });
  expect(within(screen.getByRole('region', { name: '筆記列表' })).queryByRole('button', { name: '刪除筆記' })).toBeNull();
  fireEvent.click(toolbarDelete);
  expect(screen.getByRole('status')).toHaveTextContent('請選擇要刪除的筆記');
  fireEvent.click(screen.getByRole('button', { name: '刪除筆記：第二張筆記' }));
  const dialog = await screen.findByRole('dialog', { name: '確認刪除？' });
  expect(dialog).toHaveTextContent('第二張筆記');
  fireEvent.click(within(dialog).getByRole('button', { name: '刪除' }));
  await waitFor(() => expect(screen.queryByText('第二張筆記')).toBeNull());
  expect(screen.getByText('第一張筆記')).toBeVisible();
  expect(JSON.parse(window.localStorage.getItem('matrix-notebook-entries')!)).toEqual([notes[0]]);
});

test('cancelling a deletion preserves the note and allows leaving delete mode', async () => {
  render(<MatrixNotebookPage onNavigate={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: '刪除' }));
  fireEvent.click(screen.getByRole('button', { name: '刪除筆記：第一張筆記' }));
  fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: '取消' }));
  fireEvent.click(screen.getByRole('button', { name: '取消刪除' }));
  expect(screen.queryByRole('status')).toBeNull();
  expect(JSON.parse(window.localStorage.getItem('matrix-notebook-entries')!)).toEqual(notes);
});

test('a collapsed note opens the separate editor, saves, and returns to the list', async () => {
  render(<MatrixNotebookPage onNavigate={vi.fn()} />);
  expect(screen.queryByRole('textbox', { name: '筆記內容' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: '展開筆記：第一張筆記' }));
  expect(screen.queryByRole('region', { name: '筆記列表' })).toBeNull();
  expect(screen.getByRole('textbox', { name: '筆記內容' })).toHaveValue('保留第一張內容');
  fireEvent.change(screen.getByRole('textbox', { name: '筆記內容' }), { target: { value: '更新後內容' } });
  fireEvent.click(screen.getByRole('button', { name: '寫入筆記' }));
  fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: '確認寫入' }));
  await screen.findByRole('region', { name: '筆記列表' });
  expect(JSON.parse(window.localStorage.getItem('matrix-notebook-entries')!)[0].content).toBe('更新後內容');
});

test('returning without saving still requires the existing confirmation', async () => {
  render(<MatrixNotebookPage onNavigate={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: '新增筆記' }));
  fireEvent.change(screen.getByRole('textbox', { name: '筆記標題' }), { target: { value: '尚未儲存' } });
  fireEvent.click(screen.getByRole('button', { name: '返回列表' }));
  const dialog = await screen.findByRole('dialog', { name: '內容尚未儲存' });
  fireEvent.click(within(dialog).getByRole('button', { name: '取消' }));
  expect(screen.getByRole('textbox', { name: '筆記標題' })).toHaveValue('尚未儲存');
});

test('switching to records preserves record creation and settings navigation', () => {
  render(<MatrixNotebookPage onNavigate={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: '切換至紀錄模式' }));
  expect(screen.queryByRole('button', { name: '刪除' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: '新增紀錄' }));
  expect(screen.getByRole('button', { name: '返回列表' })).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: '設定' }));
  expect(screen.getByRole('button', { name: '編輯' })).toBeVisible();
});
