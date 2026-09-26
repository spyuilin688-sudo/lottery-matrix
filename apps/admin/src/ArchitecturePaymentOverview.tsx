import { useEffect, useState } from 'react';
import { type ArchitectureSubscription } from '../shared/architecture-overview';

const dayMs = 86_400_000;
const taipeiOffset = 8 * 60 * 60 * 1000;
const taipeiDay = (now: number) => Math.floor((now + taipeiOffset) / dayMs);

function remainingDays(date: string | null | undefined, today: number) {
  if (!date) return '日期未取得';
  const days = Math.floor(Date.parse(date) / dayMs) - today;
  if (days < 0) return `日期已過 ${-days} 天，付款狀態待確認`;
  return days === 0 ? '今天付款（時間未提供）' : `剩 ${days} 天`;
}

export function usePaymentDay() {
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
  return today;
}

export function ArchitecturePaymentOverview({ item, loading, error, today }: {
  item?: ArchitectureSubscription; loading: boolean; error: string; today: number;
}) {
  const unavailable = loading ? '讀取中…' : error ? '讀取失敗' : '未取得';
  const billing = !loading && !error ? item?.billing : null;
  const account = billing?.account;
  // Only separate the known currency prefix; preserve all explanations in details.
  const amount = billing?.currentAmount?.match(/^US\$[\d,.]+/)?.[0] ?? billing?.currentAmount;
  const note = billing?.currentAmount?.slice(amount?.length ?? 0).trim().replace(/；待出帳快照 US\$[\d,.]+/, '');
  const pending = billing?.pendingAmount ?? (account?.paymentKind === 'pending' ? account.paymentAmount : null);
  return <dl className="architecturePaymentFacts">
    <div><dt>付款日期</dt><dd className={account?.paymentDate ? '' : 'architectureUnknown'}>{account?.paymentDate ? <><time dateTime={account.paymentDate}>{account.paymentDate}</time><small>時間未提供</small></> : unavailable}</dd></div>
    <div><dt>剩餘天數</dt><dd className={account?.paymentDate ? '' : 'architectureUnknown'}>{loading || error ? unavailable : remainingDays(account?.paymentDate, today)}</dd></div>
    <div><dt>目前累計</dt><dd className={amount ? '' : 'architectureUnknown'}>{amount ?? unavailable}{note && <small>{note}</small>}</dd></div>
    <div><dt>本次應付</dt><dd className={account?.paymentKind === 'due' && account.paymentAmount ? '' : 'architectureUnknown'}>{account?.paymentKind === 'due' ? account.paymentAmount ?? unavailable : unavailable}</dd></div>
    {pending && <div><dt>待出帳</dt><dd>{pending}<small>非最終應付</small></dd></div>}
    {account?.paymentKind === 'estimate' && account.paymentAmount && <div><dt>預估應付</dt><dd>{account.paymentAmount}<small>原核對資料，非最終應付</small></dd></div>}
  </dl>;
}
