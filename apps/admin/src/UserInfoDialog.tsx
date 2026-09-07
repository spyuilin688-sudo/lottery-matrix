import { useEffect, useRef, useState } from 'react';
import { formatAdminDateTime } from './admin-operations';
import './member-info.css';

type LoginRecord = { id: string; loginAt: string; ip: string | null; region: string | null };
type Client = { get(url: string): Promise<{ data: { items: LoginRecord[]; hasMore: boolean } }> };
export function UserInfoDialog({ row, client, module = 'users', onClose }: {
  row: Record<string, unknown> & { id: string }; client: Client;
  module?: 'users' | 'subscriptions'; onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [page, setPage] = useState(1);
  const [retry, setRetry] = useState(0);
  const [result, setResult] = useState<{ items: LoginRecord[]; hasMore: boolean }>({ items: [], hasMore: false });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  useEffect(() => {
    const element = dialog.current!;
    const previous = document.activeElement as HTMLElement | null;
    element.showModal();
    return () => { element.close(); previous?.focus(); };
  }, []);
  useEffect(() => {
    let active = true; setLoading(true); setError(false);
    client.get(`/api/members/${encodeURIComponent(row.id)}/login-records?module=${module}&page=${page}`)
      .then(({ data }) => { if (active) setResult(data); })
      .catch(() => { if (active) setError(true); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [row.id, module, page, retry, client]);
  const value = (input: unknown) => input == null || input === '' ? '—' : String(input);
  const fields = [
    ['LINE名稱', value(row.lineDisplayName)],
    ['註冊時間', formatAdminDateTime(row.registeredAt)],
    ['最後上線時間', formatAdminDateTime(row.lastOnlineAt)],
    ['驗證用戶ID', value(row.authUserId)],
  ];
  return <dialog ref={dialog} className="memberInfoDialog" aria-labelledby="member-info-title" onCancel={onClose}>
    <header className="memberInfoHeading"><h2 id="member-info-title">用戶資訊</h2><button type="button" className="compactButton" onClick={onClose} autoFocus>關閉</button></header>
    <div className="memberInfoCards">
      <section className="memberInfoCard" aria-label="基本資料"><dl>{fields.map(([label, content]) => <div key={label}><dt>{label}</dt><dd>{content}</dd></div>)}</dl></section>
      <section className="memberInfoCard" aria-labelledby="member-login-title">
        <h3 id="member-login-title">登入紀錄</h3>
        <div className="memberLoginTable" aria-busy={loading}>
          <table><thead><tr><th>登入時間</th><th>IP</th><th>地區</th></tr></thead>
            <tbody>{loading ? <tr><td colSpan={3} role="status">載入中…</td></tr> : error ? <tr><td colSpan={3}><span role="alert">無法載入登入紀錄</span> <button type="button" className="compactButton" onClick={() => setRetry(x => x + 1)}>重試</button></td></tr> : result.items.length === 0 ? <tr><td colSpan={3}>目前沒有登入紀錄</td></tr> : result.items.map(item => <tr key={item.id}><td>{formatAdminDateTime(item.loginAt)}</td><td>{item.ip || '尚未記錄'}</td><td>{item.region || '無法判定'}</td></tr>)}</tbody>
          </table>
        </div>
        <footer className="memberLoginPaging"><span>每頁 5 筆 · 第 {page} 頁</span><div><button type="button" className="compactButton" disabled={loading || page <= 1} onClick={() => setPage(x => x - 1)}>上一頁</button><button type="button" className="compactButton" disabled={loading || error || !result.hasMore} onClick={() => setPage(x => x + 1)}>下一頁</button></div></footer>
        <p className="memberLocationNote">地區依 IP 推估，非精確位置；舊紀錄未保存的 IP 顯示「尚未記錄」。</p>
      </section>
    </div>
  </dialog>;
}
