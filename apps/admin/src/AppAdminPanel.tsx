import { useEffect, useRef, useState } from 'react';
import { api } from './admin-platform-client';
import { parseAppPage, parseAppRevenue, type AppAdminClient, type AppAdminPage, type AppAdminMember } from './app-admin-client';
import type { AppRevenueReport } from '../../../backend/app-service-contracts';
import './app-admin.css';
export type AppAdminSection = 'users' | 'subscriptions' | 'revenue';
export function AppAdminPanel({ page, client = api }: { page: AppAdminSection; client?: AppAdminClient }) {
  const [number, setNumber] = useState(1);
  const [keyword, setKeyword] = useState('');
  const [query, setQuery] = useState('');
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<{ key: string; data?: AppAdminPage | AppRevenueReport; error?: string }>({ key: '' });
  const [pending, setPending] = useState<AppAdminMember | null>(null);
  const [saving, setSaving] = useState(false);
  const confirmation = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (!pending) return;
    const dialog = confirmation.current!; const previous = document.activeElement as HTMLElement | null;
    dialog.showModal();
    return () => { dialog.close(); previous?.focus(); };
  }, [pending]);
  const [mutationError, setMutationError] = useState('');
  const key = `app:${page}:${number}:${query}:${revision}`;
  const currentKey = useRef(key); currentKey.current = key;
  const generation = useRef(0);
  useEffect(() => {
    const turn = ++generation.current;
    const abort = new AbortController();
    setState({ key }); setPending(null); setSaving(false); setMutationError('');
    const url = page === 'revenue' ? '/api/app/revenue' : `/api/app/${page}?page=${number}&pageSize=25&keyword=${encodeURIComponent(query)}`;
    void client.get(url, { signal: abort.signal }).then(({ data }) => {
      if (!abort.signal.aborted && turn === generation.current) setState({ key, data: page === 'revenue' ? parseAppRevenue(data) : parseAppPage(data) });
    }).catch(cause => {
      if (!abort.signal.aborted && turn === generation.current) setState({ key, error: cause instanceof Error ? cause.message : 'App 資料讀取失敗' });
    });
    return () => { abort.abort(); generation.current++; };
  }, [key, page, number, query, client]);
  const data = state.key === key ? state.data : undefined;
  const error = state.key === key ? state.error : undefined;
  const list = page !== 'revenue' ? data as AppAdminPage | undefined : undefined;
  const revenue = page === 'revenue' ? data as AppRevenueReport | undefined : undefined;
  const changeStatus = async () => {
    if (!pending || saving) return;
    const selected = pending, startedKey = key, turn = generation.current;
    setSaving(true); setMutationError('');
    try {
      await client.put(`/api/app/users/${encodeURIComponent(selected.id)}/status`, { status: selected.status === 'active' ? 'disabled' : 'active', expectedRevision: selected.entitlementRevision });
      if (currentKey.current === startedKey && generation.current === turn) { setPending(null); setRevision(value => value+1); }
    } catch (cause) {
      if (currentKey.current === startedKey && generation.current === turn) setMutationError(cause instanceof Error ? cause.message : 'App 狀態儲存失敗');
    } finally { if (generation.current === turn) setSaving(false); }
  };
  return <div className="app-admin-panel">
    <h2>{page === 'users' ? 'App 用戶管理' : page === 'subscriptions' ? 'App 訂閱管理' : 'App 收入報表'}</h2>
    <p>目前版本免費使用全部功能，無需購買訂閱。</p>
    {page !== 'revenue' && <form className="app-admin-search" onSubmit={event => { event.preventDefault(); setNumber(1); setQuery(keyword.trim()); }}>
      <label>搜尋 App 用戶<input value={keyword} maxLength={200} onChange={event => setKeyword(event.target.value)} /></label><button type="submit">搜尋</button>
    </form>}
    {error ? <div role="alert"><p>App 資料載入失敗：{error}</p><button onClick={() => setRevision(value => value+1)}>重新載入</button></div> : !data ? <p role="status">App 資料讀取中…</p> : null}
    {list && <>
      <p>共 {list.total} 位 App 用戶</p>
      <div className="app-admin-table-scroll" tabIndex={0} aria-label="App 用戶資料">
        <table><thead><tr><th>用戶</th><th>狀態</th><th>權益</th>{page === 'users' && <th>操作</th>}</tr></thead>
          <tbody>{list.items.map(member => <tr key={member.id}><td>{member.displayName || '未設定名稱'}<small>{member.id}</small>{member.registeredAt && <small>註冊：{new Date(member.registeredAt).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })}</small>}</td><td>{member.status === 'active' ? '啟用' : '停用'}</td><td>{member.entitlementSource === 'free_launch' ? '免費開放' : '未確認'}{member.subscription && <small>訂閱：{member.subscription.status}</small>}</td>{page === 'users' && <td><button onClick={() => { setPending(member); setMutationError(''); }}>{member.status === 'active' ? '停用' : '啟用'}</button></td>}</tr>)}</tbody>
        </table>
      </div>
      {!list.items.length && <p>目前沒有符合條件的 App 用戶。</p>}
      <nav className="app-admin-pagination" aria-label="App 分頁"><button disabled={number<=1} onClick={() => setNumber(value => value-1)}>上一頁</button><span>第 {number} 頁</span><button disabled={number*list.pageSize>=list.total} onClick={() => setNumber(value => value+1)}>下一頁</button></nav>
    </>}
    {revenue && <section aria-label="App 收入"><p>交易筆數：{revenue.transactionCount}</p>{revenue.transactionCount === 0 ? <p>目前沒有 App 收入紀錄。</p> : <ul>{revenue.totalsByCurrency.map(row => <li key={row.currency}>{row.currency}：{row.grossMinor.toLocaleString('zh-TW')}（最小貨幣單位）</li>)}</ul>}</section>}
    {pending && <dialog ref={confirmation} className="app-admin-confirm" aria-labelledby="app-status-confirm-title" onCancel={event => { event.preventDefault(); if (!saving) setPending(null); }}>
      <h3 id="app-status-confirm-title">確認{pending.status === 'active' ? '停用' : '啟用'} App 用戶？</h3><p>{pending.displayName || pending.id}</p><p>此操作僅影響 App 權限。</p>{mutationError && <p role="alert">{mutationError}</p>}
      <button disabled={saving} onClick={() => setPending(null)}>取消</button><button disabled={saving} onClick={() => void changeStatus()}>確認{pending.status === 'active' ? '停用' : '啟用'}</button>
    </dialog>}
  </div>;
}
