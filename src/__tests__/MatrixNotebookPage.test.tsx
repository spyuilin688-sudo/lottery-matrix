// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { render } from '../../test/render-with-dialog';
import { DEFAULT_RECORD_SETTINGS, MatrixNotebookPage } from '../features/NotebookPages';
import { QuickNavigationProvider } from '../features/navigation';

const auth = vi.hoisted(() => ({ getSession: vi.fn(), onAuthStateChange: vi.fn() }));
vi.mock('../lib/supabase', () => ({ getSupabaseClient: () => ({ auth }) }));
const account = (id: string, token = `token-${id}`) => ({
  access_token: token, user: { id, app_metadata: { provider: 'custom:line' }, identities: [] },
});
let emitAuth: (event: string, session: unknown) => void;
const keyA = 'matrix-notebook:v1:account-a';
const keyB = 'matrix-notebook:v1:account-b';

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
  window.localStorage.setItem(keyA, JSON.stringify({ notes, records: [], settings: DEFAULT_RECORD_SETTINGS() }));
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

test('switching to records preserves record creation and settings navigation', async () => {
  await openNotebook();
  fireEvent.click(screen.getByRole('button', { name: '切換至紀錄模式' }));
  expect(screen.queryByRole('button', { name: '刪除' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: '新增紀錄' }));
  expect(screen.getByRole('button', { name: '返回列表' })).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: '設定' }));
  expect(screen.getByRole('button', { name: '編輯' })).toBeVisible();
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

test('an unsupported stored cost mode blocks editing and preserves the complete snapshot', async () => {
  const snapshot = JSON.parse(window.localStorage.getItem(keyA)!);
  snapshot.settings['今彩539'].tags[0].costMode = '固定成本模式';
  const stored = JSON.stringify(snapshot);
  window.localStorage.setItem(keyA, stored);
  render(<MatrixNotebookPage onNavigate={vi.fn()} />);
  fireEvent.click(await screen.findByRole('button', { name: '重試讀取筆記本' }));
  expect(screen.queryByRole('button', { name: '新增筆記' })).toBeNull();
  expect(screen.queryByRole('button', { name: '切換至紀錄模式' })).toBeNull();
  expect(window.localStorage.getItem(keyA)).toBe(stored);
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

async function startRecordDraft() {
  fireEvent.click(screen.getByRole('button', { name: '切換至紀錄模式' }));
  fireEvent.click(screen.getByRole('button', { name: '新增紀錄' }));
  fireEvent.click(screen.getByRole('button', { name: '選取號碼' }));
  fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: '07' }));
  fireEvent.click(screen.getByRole('button', { name: '完成' }));
  fireEvent.click(within(document.querySelector('.record-tag-options') as HTMLElement).getByRole('button', { name: '單號' }));
}

test.each([
  ['2026-09-10T01:30:00+08:00', '2026-09-10'],
  ['2027-01-01T00:30:00+08:00', '2027-01-01'],
])('new records and today statistics use the Taipei date at %s', async (instant, expectedDate) => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(instant));
  await openNotebook();
  await startRecordDraft();
  fireEvent.click(screen.getByRole('button', { name: '新增紀錄' }));
  const saved = JSON.parse(window.localStorage.getItem(keyA)!).records;
  expect(saved[0].date).toBe(expectedDate);
  expect(document.querySelectorAll('.notebook-record-card')).toHaveLength(1);
});

test('the displayed calendar day selects that same day across a year boundary', async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2027-01-01T12:00:00+08:00'));
  await openNotebook();
  await startRecordDraft();
  fireEvent.click(screen.getByRole('button', { name: '日期' }));
  const week = document.querySelector('.record-week-row') as HTMLElement;
  expect(within(week).getAllByRole('button').map(button => button.textContent)).toEqual(['一28', '二29', '三30', '四31', '五1', '六2', '日3']);
  fireEvent.click(within(week).getByRole('button', { name: '四31' }));
  expect(within(week).getByRole('button', { name: '四31' })).toHaveAttribute('data-selected', 'true');
  fireEvent.click(screen.getByRole('button', { name: '新增紀錄' }));
  expect(JSON.parse(window.localStorage.getItem(keyA)!).records[0].date).toBe('2026-12-31');
  expect(document.querySelectorAll('.notebook-record-card')).toHaveLength(0);
  fireEvent.click(screen.getByRole('button', { name: '本週' }));
  expect(document.querySelectorAll('.notebook-record-card')).toHaveLength(1);
});

test('unsaved record numbers warn on unload and cancellation preserves the draft', async () => {
  await openNotebook();
  await startRecordDraft();
  const unload = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(unload);
  expect(unload.defaultPrevented).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: '返回列表' }));
  const dialog = await screen.findByRole('dialog', { name: '內容尚未儲存' });
  await act(async () => { fireEvent.click(within(dialog).getByRole('button', { name: '取消' })); });
  expect(screen.getByRole('button', { name: '07' })).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: '返回列表' }));
  fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: '直接離開' }));
  await waitFor(() => expect(document.querySelector('.record-editor')).toBeNull());
  expect(JSON.parse(window.localStorage.getItem(keyA)!).records).toEqual([]);
  const cleanUnload = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(cleanUnload);
  expect(cleanUnload.defaultPrevented).toBe(false);
});

test.each(['彩種', '模式', '日期', '玩法'])('changing only %s is protected when leaving a new record', async field => {
  await openNotebook();
  fireEvent.click(screen.getByRole('button', { name: '切換至紀錄模式' }));
  fireEvent.click(screen.getByRole('button', { name: '新增紀錄' }));
  if (field === '彩種') fireEvent.click(screen.getByRole('button', { name: '六合彩' }));
  if (field === '模式') fireEvent.click(screen.getByRole('button', { name: '立柱' }));
  if (field === '玩法') fireEvent.click(within(document.querySelector('.record-tag-options') as HTMLElement).getByRole('button', { name: '單號' }));
  if (field === '日期') {
    fireEvent.click(screen.getByRole('button', { name: '日期' }));
    fireEvent.click(document.querySelector('.record-week-row button[data-selected="false"]')!);
  }
  fireEvent.click(screen.getByRole('button', { name: '設定' }));
  expect(await screen.findByRole('dialog', { name: '內容尚未儲存' })).toBeVisible();
});

test.each(['返回', '快捷'])('shortcut %s respects record leave confirmation', async label => {
  const closeShortcut = vi.fn();
  render(<QuickNavigationProvider quickActive onQuickBack={closeShortcut} onQuickOpen={closeShortcut}>
    <div className="mobile-page"><MatrixNotebookPage onNavigate={vi.fn()} /></div>
  </QuickNavigationProvider>);
  await screen.findByRole('button', { name: '新增筆記' });
  await startRecordDraft();
  fireEvent.click(screen.getByRole('button', { name: label }));
  const dialog = await screen.findByRole('dialog', { name: '內容尚未儲存' });
  expect(closeShortcut).not.toHaveBeenCalled();
  await act(async () => { fireEvent.click(within(dialog).getByRole('button', { name: '取消' })); });
  expect(screen.getByRole('button', { name: '07' })).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: label }));
  await act(async () => { fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: '直接離開' })); });
  expect(closeShortcut).toHaveBeenCalledTimes(1);
  expect(JSON.parse(window.localStorage.getItem(keyA)!).records).toEqual([]);
});

function openSettings() {
  fireEvent.click(screen.getByRole('button', { name: '切換至紀錄模式' }));
  fireEvent.click(screen.getByRole('button', { name: '設定' }));
}

test('records and customized settings persist only for their owner across reloads', async () => {
  const first = await openNotebook();
  await startRecordDraft();
  fireEvent.click(screen.getByRole('button', { name: '新增紀錄' }));
  expect(JSON.parse(window.localStorage.getItem(keyA)!).records[0]).toMatchObject({ numbers: ['07'], cost: 3040, bets: 38 });
  fireEvent.click(screen.getByRole('button', { name: '設定' }));
  fireEvent.change(screen.getByRole('spinbutton', { name: '1碰成本' }), { target: { value: '123' } });
  fireEvent.click(screen.getByRole('button', { name: '儲存設定' }));
  fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: '儲存' }));
  await waitFor(() => expect(JSON.parse(window.localStorage.getItem(keyA)!).settings['今彩539'].tags[0].costPerBet).toBe(123));
  act(() => emitAuth('SIGNED_IN', account('account-b')));
  fireEvent.click(await screen.findByRole('button', { name: '切換至紀錄模式' }));
  expect(screen.getByText('尚無紀錄')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: '設定' }));
  expect(screen.getByRole('spinbutton', { name: '1碰成本' })).toHaveValue(80);
  expect(window.localStorage.getItem(keyB)).toBeNull();
  first.unmount();
  await openNotebook();
  openSettings();
  expect(screen.getByRole('spinbutton', { name: '1碰成本' })).toHaveValue(123);
  expect(JSON.parse(window.localStorage.getItem(keyA)!).records).toHaveLength(1);
  expect(JSON.parse(window.localStorage.getItem('matrix-notebook-entries')!)).toEqual(notes);
});

test('a failed record save keeps its numbers and retries the latest quantity', async () => {
  await openNotebook();
  await startRecordDraft();
  const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('denied'); });
  fireEvent.click(screen.getByRole('button', { name: '新增紀錄' }));
  expect(screen.getByRole('button', { name: '07' })).toBeVisible();
  expect(JSON.parse(window.localStorage.getItem(keyA)!).records).toEqual([]);
  fireEvent.change(screen.getByRole('spinbutton', { name: '數量' }), { target: { value: '2' } });
  write.mockRestore();
  fireEvent.click(screen.getByRole('button', { name: '重試儲存筆記本' }));
  expect(screen.getByRole('region', { name: '紀錄列表' })).toBeVisible();
  expect(JSON.parse(window.localStorage.getItem(keyA)!).records).toHaveLength(1);
  expect(JSON.parse(window.localStorage.getItem(keyA)!).records[0]).toMatchObject({ numbers: ['07'], cost: 6080, bets: 76 });
});

test('failed settings saves preserve the latest draft and retry without resetting built-in settings', async () => {
  const first = await openNotebook();
  openSettings();
  fireEvent.change(screen.getByRole('spinbutton', { name: '1碰成本' }), { target: { value: '123' } });
  const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('denied'); });
  fireEvent.click(screen.getByRole('button', { name: '儲存設定' }));
  fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: '儲存' }));
  const retry = await screen.findByRole('button', { name: '重試儲存筆記本' });
  expect(screen.getByRole('spinbutton', { name: '1碰成本' })).toHaveValue(123);
  expect(JSON.parse(window.localStorage.getItem(keyA)!).settings['今彩539'].tags[0].costPerBet).toBe(80);
  fireEvent.change(screen.getByRole('spinbutton', { name: '1碰成本' }), { target: { value: '234' } });
  write.mockRestore();
  fireEvent.click(retry);
  expect(screen.queryByRole('alert')).toBeNull();
  first.unmount();
  await openNotebook();
  openSettings();
  expect(screen.getByRole('spinbutton', { name: '1碰成本' })).toHaveValue(234);
});

test('failed record drafts require confirmation before opening settings', async () => {
  await openNotebook();
  await startRecordDraft();
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('denied'); });
  fireEvent.click(screen.getByRole('button', { name: '新增紀錄' }));
  fireEvent.click(screen.getByRole('button', { name: '設定' }));
  fireEvent.click(within(await screen.findByRole('dialog', { name: '內容尚未儲存' })).getByRole('button', { name: '取消' }));
  expect(screen.getByRole('button', { name: '07' })).toBeVisible();
  expect(screen.getByRole('button', { name: '重試儲存筆記本' })).toBeVisible();
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
