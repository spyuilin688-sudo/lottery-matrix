import { useEffect, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { getAppInfoClient } from './app-info-client';
import { appPrivacySections } from './policy-content';
import './app-info.css';
export function isAppInfoPath(path: string) { return path === '/app-info' || path.startsWith('/app-info/'); }
export function AppInfoPage({ path = window.location.pathname }: { path?: string }) {
  const privacy = path.replace(/\/$/, '') === '/app-info/privacy';
  const deletion = path.replace(/\/$/, '') === '/app-info/delete-account';
  return <main className="app-info-page"><a href="/app-info/privacy">樂彩 Matrix App</a>
    {privacy ? <><h1>樂彩 Matrix App 隱私權政策</h1>{appPrivacySections.map(section => <section key={section.title}><h2>{section.title}</h2>{section.paragraphs.map(text => <p key={text}>{text}</p>)}</section>)}<a href="/app-info/delete-account">申請刪除 App 帳號</a></> : deletion ? <AppWebDeletion /> : <><h1>找不到 App 說明頁面</h1><a href="/app-info/delete-account">App 帳號刪除</a></>}
    <footer><a href="mailto:matrix.lottery@gmail.com">聯絡客服：matrix.lottery@gmail.com</a></footer>
  </main>;
}
function AppWebDeletion() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [message, setMessage] = useState('');
  const [done, setDone] = useState(false);
  const [reauth, setReauth] = useState(false);
  const version = useRef(0);
  const sessionId = useRef<string | null>(null);
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    const client = getAppInfoClient();
    const apply = (value: Session | null) => { sessionId.current = value?.user.id ?? null; setSession(value); setLoading(false); setConfirmed(false); };
    const start = version.current;
    void client.auth.getSession().then(({ data, error }) => {
      if (!active.current || version.current !== start) return;
      if (error) { setMessage('登入狀態讀取失敗，請重新整理或驗證登入。'); setLoading(false); }
      else apply(data.session);
    }).catch(() => {
      if (!active.current || version.current !== start) return;
      setMessage('登入狀態讀取失敗，請重新整理或驗證登入。');
      setLoading(false);
    });
    const { data } = client.auth.onAuthStateChange((_event, value) => { if (active.current) { version.current++; apply(value); } });
    return () => { active.current = false; version.current++; data.subscription.unsubscribe(); };
  }, []);
  const login = async (provider: 'custom:line' | 'google') => {
    if (busy) return;
    setBusy(true); setMessage('');
    try {
      const { error } = await getAppInfoClient().auth.signInWithOAuth({ provider, options: { redirectTo: new URL('/app-info/delete-account', window.location.origin).href, ...(provider === 'google' ? { queryParams: { prompt: 'select_account' } } : {}) } });
      if (error) throw error;
    } catch { if (active.current) setMessage('登入驗證未完成，請重試。'); }
    finally { if (active.current) setBusy(false); }
  };
  const remove = async () => {
    if (!session || !confirmed || busy) return;
    const user = session.user.id;
    setBusy(true); setMessage('');
    try {
      const { data, error } = await getAppInfoClient().functions.invoke('app-account-delete', { body: {} });
      if (!active.current || sessionId.current !== user) return;
      if (error) { setReauth(true); throw error; }
      if (data?.status === 'completed' && ['retained','deleted'].includes(data.authIdentity)) {
        setDone(true); setMessage(data.authIdentity === 'retained' ? 'App 帳號已刪除。共用登入身分及其他產品資料保留。' : 'App 帳號與僅供 App 使用的登入身分已刪除。');
      } else if (data?.status === 'pending' && data.authIdentity === 'pending') {
        setReauth(true); setConfirmed(false); setMessage('App 資料已移除，登入身分清理尚未完成。請重新驗證登入後重試；這不會重建 App 會員。');
      } else throw new Error('INVALID_RESPONSE');
    } catch { if (active.current && sessionId.current === user) setMessage('尚未確認刪除完成。請重新驗證登入後重試，或聯絡客服。'); }
    finally { if (active.current) setBusy(false); }
  };
  return <><h1>刪除樂彩 Matrix App 帳號</h1><p>不需安裝 App。使用原本的 LINE 或 Google 帳號驗證身分後，可直接提出刪除。</p>
    <h2>刪除範圍</h2><p>App 會員資料、權限、通知偏好、推播裝置、使用紀錄與排隊通知會移除。網站版資料獨立保留；仍供其他服務使用的共用登入身分會保留。</p><p>本頁無法移除各裝置的本機筆記，請在各裝置清除 App 資料。備份與安全日誌的處理請參閱<a href="/app-info/privacy">隱私權政策</a>。</p>
    {loading && <p role="status">確認登入狀態…</p>}{message && <p role="status">{message}</p>}
    {!loading && !done && (!session || reauth) && <div className="app-info-actions"><button disabled={busy} onClick={() => void login('custom:line')}>使用 LINE 驗證登入</button><button disabled={busy} onClick={() => void login('google')}>使用 Google 驗證登入</button></div>}
    {!loading && !done && session && <section><p>已驗證登入。刪除後若想再次使用 App，需明確重新建立 App 會員。</p><label className="app-info-confirm"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} disabled={busy} />我已了解刪除範圍，並要求刪除此 App 帳號。</label><button className="app-info-delete" disabled={!confirmed || busy} onClick={() => void remove()}>{busy ? '刪除處理中…' : '確認刪除 App 帳號'}</button></section>}
  </>;
}
