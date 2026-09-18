// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { render } from '../../test/render-with-dialog';
import { MatrixNotebookPage } from '../features/NotebookPages';

const auth = vi.hoisted(() => ({ getSession: vi.fn(), onAuthStateChange: vi.fn() }));
vi.mock('../lib/supabase', () => ({ getSupabaseClient: () => ({ auth }) }));
const account = (id: string, token = `token-${id}`) => ({
  access_token: token, user: { id, app_metadata: { provider: 'custom:line' }, identities: [] },
});
let emitAuth: (event: string, session: unknown) => void;
const keyA = 'matrix-notebook:v2:account-a';
const keyB = 'matrix-notebook:v2:account-b';

const notes = [
  { id: 'note-a', title: '第一張筆記', content: '保留第一張內容', updatedAt: '2026-09-08T10:00:00Z' },
  { id: 'note-b', title: '第二張筆記', content: '第二張內容', updatedAt: '2026-09-08T11:00:00Z' },
];

beforeEach(() => {
  vi.restoreAllMocks();
  auth.getSession.mockReset().mockResolvedValue({ data: { session: account('account-a') }, error: null });
  auth.onAuthStateChange.mockReset().mockImplementation((callback) => {
    emitAuth = callback;
    return { data: { subscription: { unsubscribe: vi.fn() } } };
  });
  window.localStorage.clear();
  window.localStorage.setItem(keyA, JSON.stringify({ notes }));
  window.localStorage.setItem('matrix-notebook-entries', JSON.stringify(notes));
});
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

async function openNotebook() {
  const result = render(<div className="mobile-page"><MatrixNotebookPage onNavigate={vi.fn()} /></div>);
  await screen.findByRole('button', { name: '新增筆記' });
  return result;
}

async function confirmWrite() {
  fireEvent.click(screen.getByRole('button', { name: '寫入筆記' }));
  fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: '確認寫入' }));
}

test('notebook exposes only notes after record retirement', async () => {
  await openNotebook();
  expect(screen.queryByRole('button', { name: '切換至紀錄模式' })).toBeNull();
  expect(screen.queryByLabelText('筆記本模式')).toBeNull();
  expect(screen.queryByText('新增紀錄')).toBeNull();
  expect(screen.getByRole('region', { name: '筆記列表' })).toBeVisible();
});

test('delete is a toolbar action; selecting a note confirms only that note', async () => {
  const { container } = await openNotebook();
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
  expect(JSON.parse(window.localStorage.getItem(keyA)!).notes).toEqual([notes[0]]);
});

test('cancelling a deletion preserves the note and allows leaving delete mode', async () => {
  await openNotebook();
  fireEvent.click(screen.getByRole('button', { name: '刪除' }));
  fireEvent.click(screen.getByRole('button', { name: '刪除筆記：第一張筆記' }));
  fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: '取消' }));
  fireEvent.click(screen.getByRole('button', { name: '取消刪除' }));
  expect(screen.queryByRole('status')).toBeNull();
  expect(JSON.parse(window.localStorage.getItem(keyA)!).notes).toEqual(notes);
});

test('a collapsed note opens the separate editor, saves, and returns to the list', async () => {
  await openNotebook();
  expect(screen.queryByRole('textbox', { name: '筆記內容' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: '展開筆記：第一張筆記' }));
  expect(screen.queryByRole('region', { name: '筆記列表' })).toBeNull();
  expect(screen.getByRole('textbox', { name: '筆記內容' })).toHaveValue('保留第一張內容');
  fireEvent.change(screen.getByRole('textbox', { name: '筆記內容' }), { target: { value: '更新後內容' } });
  fireEvent.click(screen.getByRole('button', { name: '寫入筆記' }));
  fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: '確認寫入' }));
  await screen.findByRole('region', { name: '筆記列表' });
  expect(JSON.parse(window.localStorage.getItem(keyA)!).notes[0].content).toBe('更新後內容');
});

test('returning without saving still requires the existing confirmation', async () => {
  await openNotebook();
  fireEvent.click(screen.getByRole('button', { name: '新增筆記' }));
  fireEvent.change(screen.getByRole('textbox', { name: '筆記標題' }), { target: { value: '尚未儲存' } });
  fireEvent.click(screen.getByRole('button', { name: '返回列表' }));
  const dialog = await screen.findByRole('dialog', { name: '內容尚未儲存' });
  fireEvent.click(within(dialog).getByRole('button', { name: '取消' }));
  expect(screen.getByRole('textbox', { name: '筆記標題' })).toHaveValue('尚未儲存');
});

test('legacy unowned notes, records and settings stay untouched and are not adopted', async () => {
  window.localStorage.removeItem(keyA);
  window.localStorage.setItem('matrix-notebook-records', '[{"private":"legacy-record"}]');
  window.localStorage.setItem('matrix-notebook-record-settings', '{"private":"legacy-settings"}');
  const legacy = Array.from({ length: window.localStorage.length }, (_, index) => {
    const key = window.localStorage.key(index)!;
    return [key, window.localStorage.getItem(key)];
  });
  await openNotebook();
  expect(screen.queryByText('第一張筆記')).toBeNull();
  expect(screen.getByText('尚無筆記')).toBeVisible();
  for (const [key, value] of legacy) expect(window.localStorage.getItem(key!)).toBe(value);
  expect(window.localStorage.getItem(keyA)).toBeNull();
});

test('switching accounts clears the draft and an old save confirmation cannot write', async () => {
  await openNotebook();
  fireEvent.click(screen.getByRole('button', { name: '展開筆記：第一張筆記' }));
  fireEvent.change(screen.getByRole('textbox', { name: '筆記內容' }), { target: { value: 'A 的私人草稿' } });
  fireEvent.click(screen.getByRole('button', { name: '寫入筆記' }));
  const oldConfirmation = within(await screen.findByRole('dialog')).getByRole('button', { name: '確認寫入' });
  act(() => emitAuth('SIGNED_IN', account('account-b')));
  fireEvent.click(oldConfirmation);
  expect(screen.queryByDisplayValue('A 的私人草稿')).toBeNull();
  expect(screen.queryByText('第一張筆記')).toBeNull();
  expect(await screen.findByText('尚無筆記')).toBeVisible();
  expect(JSON.parse(window.localStorage.getItem(keyA)!).notes).toEqual(notes);
  expect(window.localStorage.getItem(keyB)).toBeNull();
  act(() => emitAuth('SIGNED_IN', account('account-a')));
  expect(await screen.findByText('第一張筆記')).toBeVisible();
  expect(screen.queryByRole('textbox', { name: '筆記內容' })).toBeNull();
});

test('token refresh preserves the same account draft and refresh reads only committed content', async () => {
  const rendered = await openNotebook();
  fireEvent.click(screen.getByRole('button', { name: '展開筆記：第一張筆記' }));
  fireEvent.change(screen.getByRole('textbox', { name: '筆記內容' }), { target: { value: '未寫入草稿' } });
  act(() => emitAuth('TOKEN_REFRESHED', account('account-a', 'renewed-secret-token')));
  expect(screen.getByRole('textbox', { name: '筆記內容' })).toHaveValue('未寫入草稿');
  rendered.unmount();
  await openNotebook();
  fireEvent.click(screen.getByRole('button', { name: '展開筆記：第一張筆記' }));
  expect(screen.getByRole('textbox', { name: '筆記內容' })).toHaveValue('保留第一張內容');
  expect(Object.keys(window.localStorage).some((key) => key.includes('token'))).toBe(false);
});

test.each(['INITIAL_SESSION', 'TOKEN_REFRESHED', 'USER_UPDATED'])('logout clears content and ignores a stale %s event', async (event) => {
  await openNotebook();
  fireEvent.click(screen.getByRole('button', { name: '展開筆記：第一張筆記' }));
  act(() => emitAuth('SIGNED_OUT', null));
  act(() => emitAuth(event, account('account-a')));
  expect(screen.queryByRole('textbox', { name: '筆記內容' })).toBeNull();
  expect(screen.queryByRole('button', { name: '新增筆記' })).toBeNull();
  expect(JSON.parse(window.localStorage.getItem(keyA)!).notes).toEqual(notes);
});

test('an older initial session read cannot replace the account selected by an auth event', async () => {
  let finish!: (value: unknown) => void;
  auth.getSession.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
  render(<MatrixNotebookPage onNavigate={vi.fn()} />);
  await waitFor(() => expect(auth.getSession).toHaveBeenCalled());
  act(() => emitAuth('SIGNED_IN', account('account-b')));
  await act(async () => finish({ data: { session: account('account-a') }, error: null }));
  expect(screen.queryByText('第一張筆記')).toBeNull();
  expect(await screen.findByText('尚無筆記')).toBeVisible();
  expect(window.localStorage.getItem(keyB)).toBeNull();
});

test('a denied storage read blocks editing and retries without overwriting unread data', async () => {
  const original = Storage.prototype.getItem;
  const read = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(function (this: Storage, key: string) {
    if (key === keyA) throw new DOMException('denied', 'SecurityError');
    return original.call(this, key);
  });
  render(<MatrixNotebookPage onNavigate={vi.fn()} />);
  const retry = await screen.findByRole('button', { name: '重試讀取筆記本' });
  expect(screen.queryByRole('button', { name: '新增筆記' })).toBeNull();
  expect(original.call(window.localStorage, keyA)).toContain('保留第一張內容');
  read.mockRestore();
  fireEvent.click(retry);
  expect(await screen.findByText('第一張筆記')).toBeVisible();
  expect(JSON.parse(window.localStorage.getItem(keyA)!).notes).toEqual(notes);
});

test('malformed stored data is retained for recovery instead of being replaced with defaults', async () => {
  window.localStorage.setItem(keyA, '{broken-json');
  render(<MatrixNotebookPage onNavigate={vi.fn()} />);
  fireEvent.click(await screen.findByRole('button', { name: '重試讀取筆記本' }));
  expect(screen.queryByRole('button', { name: '新增筆記' })).toBeNull();
  expect(window.localStorage.getItem(keyA)).toBe('{broken-json');
});

test('adopts only the same owners legacy notes without altering the prior snapshot', async () => {
  window.localStorage.removeItem(keyA);
  const legacyKey = 'matrix-notebook:v1:account-a';
  const legacy = JSON.stringify({ notes, records: [{ id: 'retired-record' }], settings: { retired: true } });
  window.localStorage.setItem(legacyKey, legacy);
  const rendered = await openNotebook();
  fireEvent.click(screen.getByRole('button', { name: '展開筆記：第一張筆記' }));
  fireEvent.change(screen.getByRole('textbox', { name: '筆記內容' }), { target: { value: '新版筆記內容' } });
  await confirmWrite();
  await screen.findByRole('region', { name: '筆記列表' });
  expect(window.localStorage.getItem(legacyKey)).toBe(legacy);
  const saved = JSON.parse(window.localStorage.getItem(keyA)!);
  expect(Object.keys(saved)).toEqual(['notes']);
  expect(saved.notes[0].content).toBe('新版筆記內容');
  rendered.unmount();
  await openNotebook();
  fireEvent.click(screen.getByRole('button', { name: '展開筆記：第一張筆記' }));
  expect(screen.getByRole('textbox', { name: '筆記內容' })).toHaveValue('新版筆記內容');
});

test('does not revive legacy notes after the last current note is deleted', async () => {
  window.localStorage.setItem('matrix-notebook:v1:account-a', JSON.stringify({ notes }));
  window.localStorage.setItem(keyA, JSON.stringify({ notes: [] }));
  await openNotebook();
  expect(screen.getByText('尚無筆記')).toBeVisible();
  expect(screen.queryByText('第一張筆記')).toBeNull();
});

test('failed note writes keep the draft and retry saves the latest edit once', async () => {
  const rendered = await openNotebook();
  fireEvent.click(screen.getByRole('button', { name: '展開筆記：第一張筆記' }));
  fireEvent.change(screen.getByRole('textbox', { name: '筆記內容' }), { target: { value: '第一次修改' } });
  const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('full', 'QuotaExceededError'); });
  await confirmWrite();
  const retry = await screen.findByRole('button', { name: '重試儲存筆記本' });
  expect(screen.getByRole('textbox', { name: '筆記內容' })).toHaveValue('第一次修改');
  expect(JSON.parse(window.localStorage.getItem(keyA)!).notes).toEqual(notes);
  fireEvent.change(screen.getByRole('textbox', { name: '筆記內容' }), { target: { value: '最新修改' } });
  expect(screen.getByRole('alert')).toHaveTextContent('尚未儲存');
  write.mockRestore();
  fireEvent.click(retry);
  expect(await screen.findByRole('region', { name: '筆記列表' })).toBeVisible();
  expect(screen.queryByRole('alert')).toBeNull();
  expect(JSON.parse(window.localStorage.getItem(keyA)!).notes[0].content).toBe('最新修改');
  expect(JSON.parse(window.localStorage.getItem(keyA)!).notes).toHaveLength(2);
  rendered.unmount();
  await openNotebook();
  fireEvent.click(screen.getByRole('button', { name: '展開筆記：第一張筆記' }));
  expect(screen.getByRole('textbox', { name: '筆記內容' })).toHaveValue('最新修改');
});

test('failed deletion retains the note until retry succeeds', async () => {
  await openNotebook();
  fireEvent.click(screen.getByRole('button', { name: '刪除' }));
  fireEvent.click(screen.getByRole('button', { name: '刪除筆記：第二張筆記' }));
  const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('denied'); });
  fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: '刪除' }));
  const retry = await screen.findByRole('button', { name: '重試儲存筆記本' });
  expect(screen.getByText('第二張筆記')).toBeVisible();
  expect(JSON.parse(window.localStorage.getItem(keyA)!).notes).toEqual(notes);
  write.mockRestore();
  fireEvent.click(retry);
  expect(screen.queryByText('第二張筆記')).toBeNull();
  expect(JSON.parse(window.localStorage.getItem(keyA)!).notes).toEqual([notes[0]]);
});

test('a stale initial auth event cannot replace a completed session read', async () => {
  await openNotebook();
  fireEvent.click(screen.getByRole('button', { name: '新增筆記' }));
  fireEvent.change(screen.getByRole('textbox', { name: '筆記內容' }), { target: { value: 'A 草稿' } });
  act(() => emitAuth('INITIAL_SESSION', account('account-b')));
  expect(screen.getByRole('textbox', { name: '筆記內容' })).toHaveValue('A 草稿');
});

test('a failed session read permits retry but never reads or writes notebook data first', async () => {
  auth.getSession.mockRejectedValueOnce(new Error('session read failed'));
  const before = window.localStorage.getItem(keyA);
  render(<MatrixNotebookPage onNavigate={vi.fn()} />);
  const retry = await screen.findByRole('button', { name: '重試確認登入' });
  expect(screen.queryByRole('button', { name: '新增筆記' })).toBeNull();
  expect(window.localStorage.getItem(keyA)).toBe(before);
  fireEvent.click(retry);
  expect(await screen.findByText('第一張筆記')).toBeVisible();
});

test('account switches cancel deletion dialogs and discard failed-save retries', async () => {
  await openNotebook();
  fireEvent.click(screen.getByRole('button', { name: '刪除' }));
  fireEvent.click(screen.getByRole('button', { name: '刪除筆記：第一張筆記' }));
  await screen.findByRole('dialog');
  act(() => emitAuth('SIGNED_IN', account('account-b')));
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(screen.queryByText(/保留第一張內容|第一張筆記/)).toBeNull();
  act(() => emitAuth('SIGNED_IN', account('account-a')));
  fireEvent.click(screen.getByRole('button', { name: '展開筆記：第一張筆記' }));
  fireEvent.change(screen.getByRole('textbox', { name: '筆記內容' }), { target: { value: '失敗草稿' } });
  const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('denied'); });
  await confirmWrite();
  const oldRetry = await screen.findByRole('button', { name: '重試儲存筆記本' });
  write.mockRestore();
  act(() => emitAuth('SIGNED_IN', account('account-b')));
  fireEvent.click(oldRetry);
  expect(screen.queryByRole('alert')).toBeNull();
  expect(window.localStorage.getItem(keyB)).toBeNull();
  expect(JSON.parse(window.localStorage.getItem(keyA)!).notes).toEqual(notes);
});

test('cancelling delete mode also cancels a failed deletion retry', async () => {
  await openNotebook();
  fireEvent.click(screen.getByRole('button', { name: '刪除' }));
  fireEvent.click(screen.getByRole('button', { name: '刪除筆記：第一張筆記' }));
  const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('denied'); });
  fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: '刪除' }));
  await screen.findByRole('button', { name: '重試儲存筆記本' });
  fireEvent.click(screen.getByRole('button', { name: '取消刪除' }));
  write.mockRestore();
  expect(screen.queryByRole('button', { name: '重試儲存筆記本' })).toBeNull();
  expect(screen.queryByRole('alert')).toBeNull();
  expect(JSON.parse(window.localStorage.getItem(keyA)!).notes).toEqual(notes);
});

test('unsaved return confirmation cannot navigate after the account changes', async () => {
  const navigate = vi.fn();
  render(<div className="mobile-page"><MatrixNotebookPage onNavigate={navigate} /></div>);
  fireEvent.click(await screen.findByRole('button', { name: '新增筆記' }));
  fireEvent.change(screen.getByRole('textbox', { name: '筆記內容' }), { target: { value: '私人草稿' } });
  fireEvent.click(within(screen.getByRole('navigation', { name: '底部導覽' })).getByRole('button', { name: '我的' }));
  const staleLeave = within(await screen.findByRole('dialog')).getByRole('button', { name: '直接離開' });
  act(() => emitAuth('SIGNED_IN', account('account-b')));
  fireEvent.click(staleLeave);
  expect(navigate).not.toHaveBeenCalled();
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(screen.queryByDisplayValue('私人草稿')).toBeNull();
});
