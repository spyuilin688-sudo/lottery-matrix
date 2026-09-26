/// <reference types="vite/client" />
import { useEffect, useRef, useState } from 'react';
import { architectureProviders, readArchitectureSubscriptions, type ArchitectureSubscription } from '../shared/architecture-overview';
import { formatAdminDateTime } from './admin-operations';
import './architecture-overview.css';

type Client = { get(path: string): Promise<{ data: unknown }> };
const invoiceStatuses = { paid: '已付款', open: '待付款', void: '已作廢', uncollectible: '無法收款' };
const providerSyncNotes = {
  github: '每日 09:20 自動更新用量費用；方案費、方案額度及付款紀錄保留原核對資料。用量接口未提供整期預估、下次扣款金額、日期或剩餘方案額度。',
  railway: '每日 09:20 自動更新全工作區及 Agent 用量、預估、待出帳與最近帳單。分項折抵、支出上限及實際扣款日未由目前同步接口取得。',
  supabase: '尚未接通組織帳務自動同步；費用、額度及帳單保留上次官方帳務頁核對結果，不代表目前即時用量。',
  cloudflare: '每日 09:20 自動更新已取得的額度上限；每月用量、待繳金額及扣款日仍未取得。',
};

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
                  <div className="architectureIdentity"><h2 id={`architecture-${provider.id}`}>{provider.name}</h2><span>{item?.plan ?? missing}</span>{item?.fee && <span className="architecturePlanFee">方案費用 {item.fee}</span>}{!loading && provider.id === 'github' && billing?.currentAmount && <span>用量資料已取得</span>}{!loading && !error && provider.id === 'cloudflare' && !billing?.currentAmount && !account && <span>Pages 帳務未取得</span>}</div>
                  <div className="architecturePayment"><span>下次付款日期</span><strong>{account?.paymentDate ? <time dateTime={account.paymentDate}>{account.paymentDate}</time> : missing}</strong></div>
                  <div className="architecturePayment"><span>{amountLabel}</span><strong>{amount ?? missing}</strong>{account && <small className="architectureSnapshotDate">人工核對 <time dateTime={account.verifiedAt}>{formatAdminDateTime(account.verifiedAt).split(' ')[0]}</time></small>}</div>
                  <span className="architectureChevron" aria-hidden="true">⌄</span>
                </summary>
                <div className="architectureDetailBody">
                  <section className="architectureSection" aria-label={`${provider.name} 更新狀態`}>
                    <h3>資料更新狀態</h3>
                    <p>{loading ? '讀取中…' : error ? '資料讀取失敗' : !billing ? '尚未取得帳務資料' : provider.id === 'supabase' ? '尚未接通帳務自動更新' : billing?.usageBreakdown?.length ? '用量明細自動更新' : provider.id === 'cloudflare' ? '額度上限部分自動更新' : '用量總額部分自動更新'}</p>
                    <p>{providerSyncNotes[provider.id]}</p>
                    {billing && <p className="architectureVerified">{provider.id === 'supabase' ? '上次核對：' : '上次取得資料：'}<time dateTime={billing.verifiedAt}>{formatAdminDateTime(billing.verifiedAt)}</time>（台灣時間）</p>}
                  </section>
                  <section className="architectureSection" aria-label={`${provider.name} 付款說明`}>
                    <h3>付款說明</h3>
                    {provider.id === 'cloudflare' && !account && billing?.source && <p>{billing.source}</p>}
                    <p>{account?.paymentDateNote || (account?.paymentDate ? '付款日期取自官方帳務頁人工核對。' : '尚未取得已核對的下次扣款日期；續費日期與帳務期間不能視為實際扣款日。')}</p>
                    <p>{account?.paymentNote || (amount ? '金額依標示區分已確認應繳、預估與待出帳，以平台最終帳單為準。' : '尚未取得已核對的本次應繳金額；方案費用與用量不等於實際扣款。')}</p>
                    {provider.id !== 'cloudflare' && <dl className="architectureFacts">
                      <div><dt>{billing?.pendingAmount ? '待出帳金額（自動更新）' : '待出帳金額'}</dt><dd>{billing?.pendingAmount ?? '未取得；目前同步資料未提供'}</dd></div>
                    </dl>}
                    {billing?.pendingAmount && <p>待出帳為平台回傳的暫存金額，可能延遲，不代表已扣款或最終應繳；不再自行扣除折抵。</p>}
                    {account && <p className="architectureVerified">人工核對：<time dateTime={account.verifiedAt}>{formatAdminDateTime(account.verifiedAt)}</time>（官方帳務頁快照，非每日同步）</p>}
                  </section>
                  <section className="architectureSection" aria-label={`${provider.name} 費用組成`}>
                    <h3>費用組成</h3>
                    {account?.costs.length ? <><p className="architectureVerified">費用組成核對時間：<time dateTime={account.verifiedAt}>{formatAdminDateTime(account.verifiedAt)}</time>（保留快照，非自動更新）</p><dl className="architectureFacts">{account.costs.map((cost, index) => <div key={`${cost.label}-${index}`}><dt>{cost.label}</dt><dd>{cost.value}{cost.note && <small>{cost.note}</small>}</dd></div>)}</dl></> : <>
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
                  {!!billing?.usageBreakdown?.length && <section className="architectureSection" aria-label={`${provider.name} 自動用量明細`}>
                    <h3>本期用量與費用明細</h3>
                    <p>自動取得：{formatAdminDateTime(billing.verifiedAt)}；{provider.id === 'github' ? '用量按產品及計價項目彙總，不含方案月費；不同單位不可直接相加，計費用量不等於已消耗的免費額度。' : '資源費用為折抵前用量，依既有計價換算；分項折抵與折抵後金額未取得。'}</p>
                    <div className="architectureQuotas">{billing.usageBreakdown.map((detail,index) => <div className="architectureQuota" key={`${detail.label}-${index}`}>
                      <h4>{detail.label}</h4>
                      <dl><div><dt>計費用量</dt><dd>{detail.quantity ?? '未取得'}</dd></div><div><dt>折抵前費用</dt><dd>{detail.grossAmount ?? '未取得'}</dd></div><div><dt>折抵金額</dt><dd>{detail.discountAmount ?? '未取得分項折抵'}</dd></div><div><dt>折抵後費用</dt><dd>{detail.netAmount ?? '未取得'}</dd></div></dl>
                    </div>)}</div>
                  </section>}
                  <section className="architectureSection" aria-label={`${provider.name} 額度與用量`}>
                    <h3>額度與用量</h3>
                    {!!billing?.limits?.length && <>
                      <p className="architectureVerified">上限自動更新：<time dateTime={billing.verifiedAt}>{formatAdminDateTime(billing.verifiedAt)}</time>（僅上限，非已用量）</p>
                      <dl className="architectureFacts">{billing.limits.map(limit => <div key={limit.label}><dt>{limit.label}</dt><dd>{limit.value}</dd></div>)}</dl>
                    </>}
                    {account?.quotas.length ? <><p className="architectureVerified">額度明細核對時間：<time dateTime={account.verifiedAt}>{formatAdminDateTime(account.verifiedAt)}</time>（保留快照，非每日自動更新）</p><div className="architectureQuotas">{account.quotas.map((quota, index) => <div className="architectureQuota" key={`${quota.label}-${index}`}>
                      <h4>{quota.label}</h4>
                      <dl><div><dt>包含額度／上限</dt><dd>{quota.included}</dd></div><div><dt>已用</dt><dd>{quota.used}</dd></div><div><dt>剩餘</dt><dd>{quota.remaining}</dd></div><div><dt>重置時間</dt><dd>{quota.reset}</dd></div></dl>
                      {quota.note && <p>{quota.note}</p>}
                    </div>)}</div></> : <p>{billing?.limits?.length ? '每月建置已用量、剩餘額度與重置時間尚未取得。' : '尚未取得已核對的額度明細；未知用量與剩餘額度不以 0 顯示。'}</p>}
                  </section>
                  <section className="architectureSection" aria-label={`${provider.name} 帳單與付款紀錄`}>
                    <h3>帳單與付款紀錄</h3>
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
                      <p>最近帳單與歷史已核對付款分開列示；帳單標示已付款，不代表已取得實際付款日期。</p>
                    </> : <p>尚未取得帳單與付款紀錄。</p>}
                  </section>
                  <details className="architectureSource">
                    <summary>資料來源與更新時間</summary>
                    <p>{providerSyncNotes[provider.id]} 自動更新失敗時保留上次成功資料。</p>
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
