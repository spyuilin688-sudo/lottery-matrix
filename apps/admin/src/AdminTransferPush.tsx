import { useEffect, useState } from 'react';
import { currentTransferPush, disableTransferPush, enableTransferPush, pushAvailability, type TransferPushApi } from './admin-transfer-push';
import './admin-transfer-push.css';

export function AdminTransferPush({ client, isSuper }: { client: TransferPushApi; isSuper: boolean }) {
  return isSuper ? <TransferPushControl client={client} /> : null;
}
function TransferPushControl({ client }: { client: TransferPushApi }) {
  const [enabled, setEnabled] = useState(false);
  const [subscription, setSubscription] = useState<PushSubscription | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const unavailable = pushAvailability();
  useEffect(() => {
    let cancelled = false;
    if (unavailable) { setBusy(false); return; }
    currentTransferPush(client).then((state) => {
      if (!cancelled) { setEnabled(state.enabled); setSubscription(state.subscription); }
    }).catch(() => { if (!cancelled) setError('無法確認通知狀態，請重新整理或重試啟用。'); })
      .finally(() => { if (!cancelled) setBusy(false); });
    return () => { cancelled = true; };
  }, [client, unavailable]);
  const toggle = async () => {
    if (busy) return;
    setBusy(true); setError(''); setNotice('');
    try {
      if (enabled) {
        await disableTransferPush(client, subscription);
        setEnabled(false); setNotice('已停用此裝置的新轉帳通知。');
      } else {
        const next = await enableTransferPush(client);
        setSubscription(next); setEnabled(true); setNotice('已啟用此裝置的新轉帳通知。');
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : '通知設定失敗，請重試。'); }
    finally { setBusy(false); }
  };
  const summaryState = busy ? '確認中' : unavailable ? '無法使用' : error ? '設定需重試' : enabled ? '已啟用' : '未啟用';
  return <section className="adminTransferPush" aria-label="新轉帳手機通知">
    <details className="adminTransferPushDetails">
      <summary><strong>手機通知</strong><span className={error ? 'pushSummaryState pushSummaryError' : 'pushSummaryState'} role="status">{summaryState}</span></summary>
      <div className="adminTransferPushBody">
        <p>新轉帳申請通知此裝置，關閉後台或登出後仍可接收。僅提醒，不含轉帳資料。</p>
        <p className="adminTransferPushStatus" role={error ? 'alert' : 'status'}>{unavailable || error || notice || (busy ? '正在確認通知狀態…' : enabled ? '此裝置已啟用通知。' : '此裝置尚未啟用通知。')}</p>
        <div className="adminTransferPushRow"><button type="button" disabled={busy || Boolean(unavailable)} aria-busy={busy} onClick={toggle}>{enabled ? '停用此裝置通知' : '啟用此裝置通知'}</button></div>
      </div>
    </details>
  </section>;
}
