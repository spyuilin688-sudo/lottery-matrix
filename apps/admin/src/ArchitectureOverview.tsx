/// <reference types="vite/client" />
import { useEffect, useRef, useState } from 'react';
import { architectureProviders, readArchitectureSubscriptions, type ArchitectureSubscription } from '../shared/architecture-overview';
import { formatAdminDateTime } from './admin-operations';
import './architecture-overview.css';

type Client = { get(path: string): Promise<{ data: unknown }> };
const invoiceStatuses = { paid: '已付款', open: '待付款', void: '已作廢', uncollectible: '無法收款' };

export function ArchitectureOverview({ client }: { client: Client }) {
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
      <p className="architectureNote">查看下次付款，展開各平台查看費用、額度與紀錄。預估及待出帳金額以最終帳單為準。</p>
      {loading && <div className="loading" role="status">讀取訂閱資料中…</div>}
      {error && <div className="architectureError"><p className="error" role="alert">{error}</p><button type="button" className="compactButton" disabled={loading} onClick={() => setAttempt(value => value + 1)}>重新載入</button></div>}
      <div className="architectureGrid">
        {architectureProviders.map(provider => {
          const item = items.find(value => value.provider === provider.id);
          const billing = item?.billing;
          const account = billing?.account;
          const missing = loading ? '讀取中…' : '尚未確認';
          const amountLabel = account?.paymentKind === 'estimate' ? '預估應繳' : account?.paymentKind === 'pending' ? '待出帳' : '本次應繳';
          const amount = account && account.paymentKind !== 'unknown' ? account.paymentAmount : null;
          return (
            <article className="panel architectureProvider" key={provider.id} aria-labelledby={`architecture-${provider.id}`}>
              <details className="architectureDisclosure">
                <summary className="architectureSummary">
                  <div className="architectureIdentity"><h2 id={`architecture-${provider.id}`}>{provider.name}</h2><span>{item?.plan ?? missing}</span>{item?.fee && <span className="architecturePlanFee">方案費用 {item.fee}</span>}</div>
                  <div className="architecturePayment"><span>下次付款日期</span><strong>{account?.paymentDate ? <time dateTime={account.paymentDate}>{account.paymentDate}</time> : missing}</strong></div>
                  <div className="architecturePayment"><span>{amountLabel}</span><strong>{amount ?? missing}</strong>{account && <small className="architectureSnapshotDate">人工核對 <time dateTime={account.verifiedAt}>{formatAdminDateTime(account.verifiedAt).split(' ')[0]}</time></small>}</div>
                  <span className="architectureChevron" aria-hidden="true">⌄</span>
                </summary>
                <div className="architectureDetailBody">
                  <section className="architectureSection" aria-label={`${provider.name} 付款說明`}>
                    <h3>付款說明</h3>
                    <p>{account?.paymentDateNote || (account?.paymentDate ? '付款日期取自官方帳務頁人工核對。' : '尚未取得已核對的下次扣款日期；續費日期與帳務期間不能視為實際扣款日。')}</p>
                    <p>{account?.paymentNote || (amount ? '金額依標示區分已確認應繳、預估與待出帳，以平台最終帳單為準。' : '尚未取得已核對的本次應繳金額；方案費用與用量不等於實際扣款。')}</p>
                    {account && <p className="architectureVerified">人工核對：<time dateTime={account.verifiedAt}>{formatAdminDateTime(account.verifiedAt)}</time>（官方帳務頁快照，非每日同步）</p>}
                  </section>
                  <section className="architectureSection" aria-label={`${provider.name} 費用組成`}>
                    <h3>費用組成</h3>
                    {account?.costs.length ? <dl className="architectureFacts">{account.costs.map((cost, index) => <div key={`${cost.label}-${index}`}><dt>{cost.label}</dt><dd>{cost.value}{cost.note && <small>{cost.note}</small>}</dd></div>)}</dl> : <>
                      <dl className="architectureFacts"><div><dt>方案費用</dt><dd>{item?.fee ?? '尚未確認'}</dd></div></dl>
                      <p>尚未取得已核對的費用組成與折抵明細。</p>
                    </>}
                    {billing && <>
                      <dl className="architectureFacts architectureUsage">
                        <div><dt>帳務期間</dt><dd>{billing.period ?? '尚未確認'}</dd></div>
                        <div><dt>本期累計</dt><dd>{billing.currentAmount ?? '尚未確認'}</dd></div>
                        <div><dt>平台預估</dt><dd>{billing.estimatedAmount ?? '尚未確認'}</dd></div>
                      </dl>
                      <p>用量金額可能尚未計入折抵，不代表本次應繳。計價與折抵範圍見資料來源。</p>
                    </>}
                  </section>
                  <section className="architectureSection" aria-label={`${provider.name} 額度與用量`}>
                    <h3>額度與用量</h3>
                    {account?.quotas.length ? <div className="architectureQuotas">{account.quotas.map((quota, index) => <div className="architectureQuota" key={`${quota.label}-${index}`}>
                      <h4>{quota.label}</h4>
                      <dl><div><dt>包含額度／上限</dt><dd>{quota.included}</dd></div><div><dt>已用</dt><dd>{quota.used}</dd></div><div><dt>剩餘</dt><dd>{quota.remaining}</dd></div><div><dt>重置時間</dt><dd>{quota.reset}</dd></div></dl>
                      {quota.note && <p>{quota.note}</p>}
                    </div>)}</div> : <p>尚未取得已核對的額度明細；未知用量與剩餘額度不以 0 顯示。</p>}
                  </section>
                  <section className="architectureSection" aria-label={`${provider.name} 帳單與付款紀錄`}>
                    <h3>帳單與付款紀錄</h3>
                    {billing ? <>
                      <dl className="architectureFacts">
                        <div><dt>最近帳單</dt><dd>{billing.latestInvoiceAmount ?? '尚未確認'}{billing.latestInvoiceStatus && `（${invoiceStatuses[billing.latestInvoiceStatus]}）`}</dd></div>
                        <div><dt>上次付款日期</dt><dd>{billing.latestPaymentDate ? <time dateTime={billing.latestPaymentDate}>{billing.latestPaymentDate}</time> : '尚未確認'}</dd></div>
                      </dl>
                      <p>此處保留最近一筆紀錄；歷史付款的原核對日期見資料來源。</p>
                    </> : <p>尚未取得帳單與付款紀錄。</p>}
                  </section>
                  <details className="architectureSource">
                    <summary>資料來源與更新時間</summary>
                    <p>GitHub、Railway 每日 09:20（台灣時間）同步一次；失敗時保留上次資料。Supabase、Cloudflare Pages 尚未自動同步。</p>
                    <p className="architectureVerified">方案確認：{item?.verifiedAt ? <time dateTime={item.verifiedAt}>{formatAdminDateTime(item.verifiedAt)}</time> : '尚未確認'}</p>
                    {item?.renewalDate && <p>方案續費紀錄：<time dateTime={item.renewalDate}>{item.renewalDate}</time>（不代表扣款日）</p>}
                    {billing && <><p className="architectureVerified">帳務資料更新：<time dateTime={billing.verifiedAt}>{formatAdminDateTime(billing.verifiedAt)}</time>（不代表歷史付款重新核對）</p><p>{billing.source}</p></>}
                    {account && <p>{account.source}</p>}
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
