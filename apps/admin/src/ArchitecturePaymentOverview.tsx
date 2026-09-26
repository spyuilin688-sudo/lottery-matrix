import { useEffect, useState } from 'react';
import { type ArchitectureSubscription } from '../shared/architecture-overview';
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

function remainingCycleDays(cycle: NonNullable<ArchitectureSubscription['billing']>['billingCycle'], today: number) {
  if (!cycle) return '日期未取得';
  const endDay = cycle.precision === 'timestamp' ? taipeiDay(Date.parse(cycle.end)) : Math.floor(Date.parse(cycle.end) / dayMs);
  const days = endDay - today;
  return days < 0 ? '本期已結束，待更新' : days === 0 ? '今天結束' : `剩 ${days} 天`;
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
  const cycle = billing?.billingCycle;
  const renewalDate = !loading && !error ? item?.renewalDate : null;
  // Only separate the known currency prefix; preserve all explanations in details.
  const amount = billing?.currentAmount?.match(/^US\$[\d,.]+/)?.[0] ?? billing?.currentAmount;
  const note = billing?.currentAmount?.slice(amount?.length ?? 0).trim().replace(/；待出帳快照 US\$[\d,.]+/, '');
  const pending = billing?.pendingAmount ?? (account?.paymentKind === 'pending' ? account.paymentAmount : null);
  return <dl className="architecturePaymentFacts">
    <div><dt>本期結束</dt><dd className={cycle ? '' : 'architectureUnknown'}>{cycle ? <><time dateTime={cycle.end}>{cycle.precision === 'timestamp' ? formatAdminDateTime(cycle.end) : cycle.end}</time><small>{cycle.precision === 'timestamp' ? '台灣時間' : '時間未提供'}</small></> : unavailable}</dd></div>
    <div><dt>距本期結束</dt><dd className={cycle ? '' : 'architectureUnknown'}>{loading || error ? unavailable : remainingCycleDays(cycle, today)}</dd></div>
    {renewalDate && <div><dt>方案續費日</dt><dd><time dateTime={renewalDate}>{renewalDate}</time><small>時間未提供；不代表扣款日</small></dd></div>}
    <div><dt>付款日期</dt><dd className={account?.paymentDate ? '' : 'architectureUnknown'}>{account?.paymentDate ? <><time dateTime={account.paymentDate}>{account.paymentDate}</time><small>時間未提供</small></> : unavailable}</dd></div>
    <div><dt>距離付款</dt><dd className={account?.paymentDate ? '' : 'architectureUnknown'}>{loading || error ? unavailable : remainingDays(account?.paymentDate, today)}</dd></div>
    <div><dt>目前累計</dt><dd className={amount ? '' : 'architectureUnknown'}>{amount ?? unavailable}{note && <small>{note}</small>}</dd></div>
    <div><dt>本次應付</dt><dd className={account?.paymentKind === 'due' && account.paymentAmount ? '' : 'architectureUnknown'}>{account?.paymentKind === 'due' ? account.paymentAmount ?? unavailable : unavailable}</dd></div>
    {pending && <div><dt>待出帳</dt><dd>{pending}<small>非最終應付</small></dd></div>}
    {account?.paymentKind === 'estimate' && account.paymentAmount && <div><dt>預估應付</dt><dd>{account.paymentAmount}<small>原核對資料，非最終應付</small></dd></div>}
  </dl>;
}
