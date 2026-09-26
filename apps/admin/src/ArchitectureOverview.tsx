/// <reference types="vite/client" />
import { useEffect, useRef, useState } from 'react';
import { architectureProviders, readArchitectureSubscriptions, type ArchitectureSubscription } from '../shared/architecture-overview';
import { formatAdminDateTime } from './admin-operations';
import './architecture-overview.css';
import { ArchitecturePaymentOverview, usePaymentDay } from './ArchitecturePaymentOverview';

type Client = { get(path: string): Promise<{ data: unknown }> };
const invoiceStatuses = { paid: '已付款', open: '待付款', void: '已作廢', uncollectible: '無法收款' };
const providerSyncDetails = {
  github: [['更新時間', '每日 09:20'], ['自動更新', '用量費用'], ['人工核對', '方案費、方案額度、付款紀錄'], ['尚未取得', '整期預估、扣款金額與日期、剩餘方案額度']],
  railway: [['更新時間', '每日 09:20'], ['自動更新', '帳期、下次出帳、全工作區與 Agent 用量、預估、待出帳、最近帳單'], ['尚未取得', '分項折抵、支出上限、實際扣款日']],
  supabase: [['自動更新', '尚未接通'], ['人工核對', '費用、額度、帳單；保留上次資料，非即時用量']],
  cloudflare: [['更新時間', '每日 09:20'], ['自動更新', '部分額度上限'], ['尚未取得', '每月用量、待繳金額、扣款日']],
};

export function ArchitectureOverview({ client }: { client: Client }) {
  const today = usePaymentDay();
  const [items, setItems] = useState<ArchitectureSubscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const request = useRef<{ client: Client; attempt: number; promise: Promise<ArchitectureSubscription[]> } | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    if (!request.current || request.current.client !== client || request.current.attempt !== attempt) {
      request.current = { client, attempt, promise: client.get('/api/architecture-overview').then(({ data }) => {
        if (!data || typeof data !== 'object' || !('items' in data)) throw new Error('資料格式不符');
        return readArchitectureSubscriptions(data.items);
      }) };
    }
    void request.current.promise.then(result => {
      if (active) setItems(result);
    }, () => {
      if (active) { setItems([]); setError('無法讀取訂閱資料，請重新載入。'); }
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [client, attempt]);

  return (
    <div className="architectureOverview" aria-label="平台訂閱總覽" aria-busy={loading}>
      <p className="architectureNote">美元計價；時間與天數依台灣時區。本期結束不等於扣款日。</p>
      {loading && <div className="loading" role="status">讀取訂閱資料中…</div>}
      {error && <div className="architectureError"><p className="error" role="alert">{error}</p><button type="button" className="compactButton" disabled={loading} onClick={() => setAttempt(value => value + 1)}>重新載入</button></div>}
      <div className="architectureGrid">
        {architectureProviders.map(provider => {
          const item = items.find(value => value.provider === provider.id);
          const billing = item?.billing;
          const account = billing?.account;
          const missing = loading ? '讀取中…' : '尚未確認';
          const amount = account && account.paymentKind !== 'unknown' ? account.paymentAmount : null;
          return (
            <article className="panel architectureProvider" key={provider.id} aria-labelledby={`architecture-${provider.id}`}>
              <header className="architectureProviderHeader"><h2 id={`architecture-${provider.id}`}>{provider.name}</h2><span>{item?.plan ?? missing}</span></header>
              <ArchitecturePaymentOverview item={item} loading={loading} error={error} today={today} />
              <details className="architectureDisclosure">
                <summary className="architectureSummary">查看帳務明細<span className="architectureChevron" aria-hidden="true">⌄</span></summary>
                <div className="architectureDetailBody">
                  <details className="architectureSection" aria-label={`${provider.name} 更新狀態`}><summary>資料更新狀態</summary>
                    {(loading || error || !billing) && <p>{loading ? '讀取中…' : error ? '資料讀取失敗' : '帳務資料未取得'}</p>}
                    <dl className="architectureFacts">{providerSyncDetails[provider.id].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
                  </details>
                  <details className="architectureSection" aria-label={`${provider.name} 付款說明`}><summary>付款說明</summary>
                    <p>{account?.paymentDate ? '付款日期由官方帳務頁人工核對。' : '扣款日期未取得；出帳日與續費日不是扣款日。'}</p>
                    <p>{amount ? '預估、待出帳與應繳分開列示，以最終帳單為準。' : '本次應付未取得；方案費與用量不代表實際扣款。'}</p>
                    {provider.id !== 'cloudflare' && <dl className="architectureFacts">
                      <div><dt>待出帳金額</dt><dd>{billing?.pendingAmount ?? '未取得'}{billing?.pendingAmount && <small>自動更新</small>}</dd></div>
                    </dl>}
                    {billing?.pendingAmount && <p>平台暫存金額可能延遲，尚非最終帳單。</p>}

                  </details>
                  <details className="architectureSection" aria-label={`${provider.name} 費用組成`}><summary>費用組成</summary>
                    {account?.costs.length ? <><dl className="architectureFacts">{account.costs.map((cost, index) => <div key={`${cost.label}-${index}`}><dt>{cost.label}</dt><dd>{cost.value}{cost.note && <small>{cost.note}</small>}</dd></div>)}</dl></> : <>
                      <dl className="architectureFacts"><div><dt>方案費用</dt><dd>{item?.fee ?? '尚未確認'}</dd></div></dl>
                      <p>費用組成與折抵明細未取得。</p>
                    </>}
                    {billing && <>
                      <dl className="architectureFacts architectureUsage">
                        <div><dt>帳務期間</dt><dd>{billing.period ?? '尚未確認'}</dd></div>
                        <div><dt>本期累計</dt><dd>{billing.currentAmount ?? '尚未確認'}</dd></div>
                        <div><dt>平台預估</dt><dd>{billing.estimatedAmount ?? '尚未確認'}</dd></div>
                      </dl>
                      <p>用量可能未扣折抵，非最終應付；計價範圍見資料來源。</p>
                    </>}
                  </details>
                  {!!billing?.usageBreakdown?.length && <details className="architectureSection" aria-label={`${provider.name} 自動用量明細`}><summary>本期用量與費用明細</summary>
                    <p>{provider.id === 'github' ? '不含方案月費。各項用量分開計算，不能當成免費額度用量。' : '費用依既有單價換算，尚未扣除折抵。'}</p>
                    <div className="architectureQuotas">{billing.usageBreakdown.map((detail,index) => <div className="architectureQuota" key={`${detail.label}-${index}`}>
                      <h4>{detail.label}</h4>
                      <dl><div><dt>計費用量</dt><dd>{detail.quantity ?? '未取得'}</dd></div><div><dt>折抵前費用</dt><dd>{detail.grossAmount ?? '未取得'}</dd></div><div><dt>折抵金額</dt><dd>{detail.discountAmount ?? '未取得分項折抵'}</dd></div><div><dt>折抵後費用</dt><dd>{detail.netAmount ?? '未取得'}</dd></div></dl>
                    </div>)}</div>
                  </details>}
                  <details className="architectureSection" aria-label={`${provider.name} 額度與用量`}><summary>額度與用量</summary>
                    {!!billing?.limits?.length && <>
                      <p className="architectureVerified">上限更新：<time dateTime={billing.verifiedAt}>{formatAdminDateTime(billing.verifiedAt)}</time>（非已用量）</p>
                      <dl className="architectureFacts">{billing.limits.map(limit => <div key={limit.label}><dt>{limit.label}</dt><dd>{limit.value}</dd></div>)}</dl>
                    </>}
                    {account?.quotas.length ? <><div className="architectureQuotas">{account.quotas.map((quota, index) => <div className="architectureQuota" key={`${quota.label}-${index}`}>
                      <h4>{quota.label}</h4>
                      <dl><div><dt>包含額度／上限</dt><dd>{quota.included}</dd></div><div><dt>已用</dt><dd>{quota.used}</dd></div><div><dt>剩餘</dt><dd>{quota.remaining}</dd></div><div><dt>重置時間</dt><dd>{quota.reset}</dd></div></dl>
                      {quota.note && <p>{quota.note}</p>}
                    </div>)}</div></> : <p>{billing?.limits?.length ? '每月建置用量、剩餘額度與重置時間未取得。' : '額度明細未取得；未知值不以 0 表示。'}</p>}
                  </details>
                  <details className="architectureSection" aria-label={`${provider.name} 帳單與付款紀錄`}><summary>帳單與付款紀錄</summary>
                    {billing ? <>
                      <dl className="architectureFacts">
                        <div><dt>最近帳單</dt><dd>{billing.latestInvoiceAmount ?? '尚未確認'}{billing.latestInvoiceStatus && `（${invoiceStatuses[billing.latestInvoiceStatus]}）`}</dd></div>
                        <div><dt>上次付款日期</dt><dd>{billing.latestPaymentDate ? <time dateTime={billing.latestPaymentDate}>{billing.latestPaymentDate}</time> : '尚未確認'}</dd></div>
                      </dl>
                      {billing.manualInvoiceVerifiedAt && <p className="architectureVerified">帳單／付款原核對時間：<time dateTime={billing.manualInvoiceVerifiedAt}>{formatAdminDateTime(billing.manualInvoiceVerifiedAt)}</time></p>}
                      {billing.manualPayment && <>
                        <h4>歷史已核對付款</h4>
                        <dl className="architectureFacts"><div><dt>付款日期</dt><dd><time dateTime={billing.manualPayment.paymentDate}>{billing.manualPayment.paymentDate}</time></dd></div><div><dt>付款金額</dt><dd>{billing.manualPayment.amount}</dd></div></dl>
                        <p className="architectureVerified">原核對時間：{formatAdminDateTime(billing.manualPayment.verifiedAt)}；{billing.manualPayment.source}</p>
                      </>}
                      <p>帳單標示「已付款」，不代表付款日期已取得。</p>
                    </> : <p>尚未取得帳單與付款紀錄。</p>}
                  </details>
                  <details className="architectureSource">
                    <summary>資料來源與更新時間</summary>
                    {provider.id !== 'supabase' && <p>自動更新失敗時，保留上次成功資料。</p>}
                    <dl className="architectureFacts">
                      <div><dt>方案確認</dt><dd>{item?.verifiedAt ? <time dateTime={item.verifiedAt}>{formatAdminDateTime(item.verifiedAt)}</time> : '尚未確認'}</dd></div>
                      {item?.renewalDate && <div><dt>續費紀錄</dt><dd><time dateTime={item.renewalDate}>{item.renewalDate}</time><small>非扣款日</small></dd></div>}
                      {billing && <div><dt>帳務更新</dt><dd><time dateTime={billing.verifiedAt}>{formatAdminDateTime(billing.verifiedAt)}</time><small>歷史付款未重新核對</small></dd></div>}
                      {billing?.billingCycle && <div><dt>帳期核對</dt><dd>{formatAdminDateTime(billing.billingCycle.verifiedAt)}<small>{billing.billingCycle.source}</small></dd></div>}
                      {account && <div><dt>人工核對</dt><dd>{formatAdminDateTime(account.verifiedAt)}<small>付款、費用、額度；非自動更新</small></dd></div>}
                      {billing && <div><dt>帳務來源</dt><dd>{billing.source}</dd></div>}
                      {account && <div><dt>核對來源</dt><dd>{account.source}</dd></div>}
                      {account?.paymentDateNote && <div><dt>付款日期依據</dt><dd>{account.paymentDateNote}</dd></div>}
                      {account?.paymentNote && <div><dt>付款金額依據</dt><dd>{account.paymentNote}</dd></div>}
                    </dl>
                  </details>
                  <a className="compactButton architectureLink" href={provider.url} target="_blank" rel="noopener noreferrer" aria-label={`${provider.name} 管理訂閱（另開分頁）`}>管理訂閱 <span aria-hidden="true">↗</span></a>
                </div>
              </details>
            </article>
          );
        })}
      </div>
    </div>
  );
}
