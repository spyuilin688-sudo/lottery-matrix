import { useEffect, useState } from 'react';
import { architectureProviders, type ArchitectureSubscription } from '../shared/architecture-overview';
import { formatAdminDateTime } from './admin-operations';

const dayMs = 86_400_000;
const taipeiOffset = 8 * 60 * 60 * 1000;
const taipeiDay = (now: number) => Math.floor((now + taipeiOffset) / dayMs);

function remainingDays(date: string | null | undefined, today: number) {
  if (!date) return '日期未取得';
  const days = Math.floor(Date.parse(date) / dayMs) - today;
  if (days < 0) return `日期已過 ${-days} 天，付款狀態待確認`;
  return days === 0 ? '今天付款（時間未提供）' : `剩 ${days} 天`;
}

export function ArchitecturePaymentOverview({ items, loading, error }: {
  items: ArchitectureSubscription[]; loading: boolean; error: string;
}) {
  const [today, setToday] = useState(() => taipeiDay(Date.now()));
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const update = () => {
      clearTimeout(timer);
      const now = Date.now();
      setToday(taipeiDay(now));
      timer = setTimeout(update, dayMs - ((now + taipeiOffset) % dayMs));
    };
    update();
    const resume = () => { if (document.visibilityState === 'visible') update(); };
    document.addEventListener('visibilitychange', resume);
    return () => { clearTimeout(timer); document.removeEventListener('visibilitychange', resume); };
  }, []);
  const unavailable = loading ? '讀取中…' : error ? '讀取失敗' : '未取得';
  return <section className="architecturePaymentOverview" aria-labelledby="payment-overview-title">
    <h2 id="payment-overview-title">付款總覽</h2>
    <p className="architectureNote">剩餘天數按台灣日期計算；付款時間未提供時不推算。累計費用、預估及待出帳不等於最終應付。</p>
    <div className="architecturePaymentCards">{architectureProviders.map(provider => {
      const billing = !loading && !error ? items.find(item => item.provider === provider.id)?.billing : null;
      const account = billing?.account;
      return <section className="architecturePaymentCard" key={provider.id} aria-label={`${provider.name} 付款總覽`}>
        <h3>{provider.name}</h3>
        <dl className="architecturePaymentFacts">
          <div><dt>付款日期／時間</dt><dd>{account?.paymentDate ? <><time dateTime={account.paymentDate}>{account.paymentDate}</time><small>時間未提供</small></> : unavailable}</dd></div>
          <div><dt>距離付款</dt><dd>{loading || error ? unavailable : remainingDays(account?.paymentDate, today)}</dd></div>
          <div><dt>目前累計費用</dt><dd>{billing?.currentAmount ?? unavailable}</dd></div>
          <div><dt>本次應付金額</dt><dd>{account?.paymentKind === 'due' ? account.paymentAmount ?? unavailable : unavailable}</dd></div>
        </dl>
        {billing?.pendingAmount && <p>待出帳：<strong>{billing.pendingAmount}</strong>（尚非最終應付）</p>}
        {account?.paymentKind === 'pending' && account.paymentAmount && !billing?.pendingAmount && <p>待出帳（原核對）：{account.paymentAmount}</p>}
        {account?.paymentKind === 'estimate' && account.paymentAmount && <p>預估應付（原核對）：{account.paymentAmount}</p>}
        {billing && <p className="architectureSnapshotDate">費用資料時間：<time dateTime={billing.verifiedAt}>{formatAdminDateTime(billing.verifiedAt)}</time>（台灣時間）{provider.id === 'supabase' ? '；尚未自動更新' : ''}</p>}
        {account && <p className="architectureSnapshotDate">付款資料原核對：<time dateTime={account.verifiedAt}>{formatAdminDateTime(account.verifiedAt)}</time>（台灣時間）</p>}
      </section>;
    })}</div>
  </section>;
}
