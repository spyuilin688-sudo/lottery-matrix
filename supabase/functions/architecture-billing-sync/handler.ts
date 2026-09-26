type Row = Record<string, any>;
type Dependencies = { getEnv(name: string): string | undefined; fetch: typeof fetch; now(): Date };
const workspaceId = '8b32b524-e3de-4ad2-a37d-4d641bca491a';
const row = (value: unknown): Row => value && typeof value === 'object' && !Array.isArray(value) ? value as Row : {};
const amount = (value: unknown): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw Error('INVALID_AMOUNT');
  return value;
};
const money = (value: number) => `US$${amount(value).toFixed(2)}`;
const date = (value: unknown): string => {
  if (typeof value !== 'string' || !value) throw Error('INVALID_DATE');
  const d = new Date(/^\d{10}$/.test(value) ? Number(value) * 1000 : value);
  if (!Number.isFinite(d.getTime())) throw Error('INVALID_DATE');
  return d.toISOString().slice(0, 10);
};
const empty = () => ({latestInvoiceAmount:null,latestInvoiceStatus:null,latestPaymentDate:null,currentAmount:null,estimatedAmount:null,period:null});

export function githubSnapshot(body: Row, previous: Row | null, now: Date) {
  if (!Array.isArray(body.usageItems)) throw Error('INVALID_USAGE');
  const total = body.usageItems.reduce((sum: number, item: Row) => sum + amount(item.netAmount), 0);
  const year = now.getUTCFullYear(), month = now.getUTCMonth();
  const start = new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10);
  const end = new Date(Date.UTC(year, month + 1, 0)).toISOString().slice(0, 10);
  const manualInvoiceVerifiedAt = previous?.manualInvoiceVerifiedAt ?? previous?.verifiedAt ?? null;
  return {...empty(),
    latestInvoiceAmount: previous?.latestInvoiceAmount ?? null,
    latestInvoiceStatus: previous?.latestInvoiceStatus ?? null,
    latestPaymentDate: previous?.latestPaymentDate ?? null,
    manualInvoiceVerifiedAt,
    currentAmount: `${money(total)}（折抵後用量；不含方案費）`,
    period: `${start}－${end}`,
    source: `GitHub 用量 API（個人帳號全部儲存庫）；歷史付款保留${manualInvoiceVerifiedAt ? date(manualInvoiceVerifiedAt) : '先前'}核對資料`,
    verifiedAt: now.toISOString(),
  };
}

// Matches the official Railway CLI src/commands/usage.rs dollar conversion.
const rates: Record<string, number> = {MEMORY_USAGE_GB:10/43200,CPU_USAGE:20/43200,NETWORK_TX_GB:0.05,DISK_USAGE_GB:0.15/43200,BACKUP_USAGE_GB:0.15/43200};
const measurements = Object.keys(rates);
function usageCost(items: unknown, field: 'value' | 'estimatedValue') {
  if (!Array.isArray(items)) throw Error('INVALID_USAGE');
  return items.reduce((sum, item) => {
    if (!(item.measurement in rates)) throw Error('UNKNOWN_MEASUREMENT');
    return sum + amount(item[field]) * rates[item.measurement];
  }, 0);
}
export function railwaySnapshot(data: Row, now: Date, previous: Row | null = null) {
  const workspace = row(data.workspace), customer = row(workspace.customer);
  if (workspace.id !== workspaceId || !Array.isArray(customer.invoices)) throw Error('INVALID_WORKSPACE');
  const current = amount(customer.currentUsage);
  const period = row(customer.billingPeriod);
  const agent = row(data.agentUsage);
  if (!Number.isSafeInteger(agent.totalUsedCents) || date(agent.billingPeriodEnd)!==date(period.end)) throw Error('INVALID_AGENT_PERIOD');
  const agentAmount=amount(agent.totalUsedCents)/100;
  if (!Array.isArray(customer.subscriptions)) throw Error('INVALID_SUBSCRIPTIONS');
  const active=customer.subscriptions.filter((subscription:Row)=>subscription.status==='active');
  const pending=active.length===1 && Number.isSafeInteger(active[0].nextInvoiceCurrentTotal)
    ? active[0].nextInvoiceCurrentTotal/100 : null;
  const invoices = customer.invoices.map((invoice: Row): Row => ({...invoice, sortDate:date(invoice.periodEnd)}))
    .sort((a: Row,b: Row) => b.sortDate.localeCompare(a.sortDate));
  const latest = invoices[0];
  if (latest && !Number.isSafeInteger(latest.total)) throw Error('INVALID_INVOICE');
  const estimated = data.estimatedUsage == null || data.usage == null ? null
    : usageCost(data.estimatedUsage,'estimatedValue') + Math.max(0,current-usageCost(data.usage,'value')) + agentAmount;
  const manualPayment = previous?.manualPayment ?? (previous?.latestPaymentDate && previous?.latestInvoiceAmount
    ? {paymentDate:previous.latestPaymentDate,amount:previous.latestInvoiceAmount,verifiedAt:previous.verifiedAt,source:previous.source} : null);
  const source = 'Railway API（全工作區含 Agent）；用量／預估未折抵；待出帳可能延遲；API 未提供付款日期'
    + (manualPayment ? `；人工核對付款：${date(manualPayment.paymentDate)} ${manualPayment.amount}（核對：${date(manualPayment.verifiedAt)}；非本期付款日期）` : '');
  if (source.length>200) throw Error('INVALID_PAYMENT_PROVENANCE');
  return {...empty(),
    manualPayment,
    currentAmount: `${money(current+agentAmount)}（折抵前用量${pending===null?'':`；待出帳快照 ${money(pending)}`}）`,
    estimatedAmount: estimated === null ? null : `${money(estimated)}（折抵前用量預估）`,
    latestInvoiceAmount:latest ? money(latest.total/100) : null,
    latestInvoiceStatus:latest && ['paid','open','void','uncollectible'].includes(latest.status) ? latest.status : null,
    period:`${date(period.start)}－${date(period.end)}（結束時間不含）`,
    source,
    verifiedAt:now.toISOString(),
  };
}

export function createSyncHandler(deps: Dependencies) {
  const json = (body: unknown, status=200) => Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
  async function api(url: string, init: RequestInit={}) {
    const response = await deps.fetch(url,{...init,redirect:'error',signal:AbortSignal.timeout(15000)});
    if (!response.ok) { await response.body?.cancel(); throw Error(`HTTP_${response.status}`); }
    if (response.headers.get('link')?.includes('rel="next"')) throw Error('INCOMPLETE_RESPONSE');
    return response.json();
  }
  return async (request: Request) => {
    if (request.method !== 'POST') return json({error:'METHOD_NOT_ALLOWED'},405);
    const expected = deps.getEnv('MATRIX_NOTIFICATION_DISPATCH_TOKEN')?.trim();
    const supplied = request.headers.get('x-matrix-dispatch-token') ?? '';
    if (!expected || expected.length !== supplied.length) return json({error:'UNAUTHORIZED'},401);
    let difference=0;
    for(let i=0;i<expected.length;i++) difference|=expected.charCodeAt(i)^supplied.charCodeAt(i);
    if (difference!==0) return json({error:'UNAUTHORIZED'},401);
    let options: Row;
    try { options=row(await request.json()); } catch { return json({error:'INVALID_BODY'},400); }
    const dryRun=options.dryRun===true;
    const base=deps.getEnv('SUPABASE_URL')?.replace(/\/$/,'');
    const key=deps.getEnv('SUPABASE_SERVICE_ROLE_KEY');
    if (!base || !key) return json({error:'STORAGE_NOT_CONFIGURED'},503);
    const headers={apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json'};
    const rpc=(name:string,body:Row)=>api(`${base}/rest/v1/rpc/${name}`,{method:'POST',headers,body:JSON.stringify(body)});
    let runId: string | null=null;
    try {
      if(!dryRun) {
        runId=await rpc('claim_admin_architecture_billing_run',{});
        if(!runId) return json({status:'already_claimed'});
      }
      const rows=await api(`${base}/rest/v1/admin_architecture_subscriptions?select=provider,billing_snapshot&limit=4`,{headers});
      if(!Array.isArray(rows)) throw Error('STORAGE_READ_FAILED');
      const now=deps.now();
      const results: Row={};
      await Promise.all(['github','railway'].map(async provider=>{
        try {
          const token=(provider==='github' ? deps.getEnv('GITHUB_BILLING_API_TOKEN') || deps.getEnv('GITHUB_ACTIONS_TOKEN') : deps.getEnv('RAILWAY_BILLING_API_TOKEN'))?.trim();
          if(!token) throw Error('MISSING_CREDENTIAL');
          let snapshot;
          if(provider==='github') {
            const body=await api(`https://api.github.com/users/spyuilin688-sudo/settings/billing/usage?year=${now.getUTCFullYear()}&month=${now.getUTCMonth()+1}`,{headers:{Authorization:`Bearer ${token}`,Accept:'application/json','X-GitHub-Api-Version':'2026-03-10'}});
            snapshot=githubSnapshot(row(body),rows.find((r:Row)=>r.provider==='github')?.billing_snapshot??null,now);
          } else {
            const body=await api('https://backboard.railway.com/graphql/v2',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({
              query:`query BillingSync($workspaceId:String!,$measurements:[MetricMeasurement!]!) {
                workspace(workspaceId:$workspaceId) { id customer { currentUsage billingPeriod {start end} subscriptions { status nextInvoiceCurrentTotal } invoices {total status periodStart periodEnd} } }
                agentUsage(workspaceId:$workspaceId) {totalUsedCents billingPeriodEnd}
                usage(workspaceId:$workspaceId,measurements:$measurements,includeDeleted:true) {measurement value}
                estimatedUsage(workspaceId:$workspaceId,measurements:$measurements,includeDeleted:true) {measurement estimatedValue}
              }`,variables:{workspaceId,measurements}})});
            if(body.errors?.length) throw Error('PROVIDER_REJECTED');
            snapshot=railwaySnapshot(row(body.data),now,rows.find((r:Row)=>r.provider==='railway')?.billing_snapshot??null);
          }
          results[provider]={status:'synced',snapshot};
        } catch { results[provider]={status:'failed',reason:'帳單讀取或格式驗證失敗；保留上次資料'}; }
      }));
      results.supabase={status:'pending',reason:'尚未確認組織帳單公開 API'};
      results.cloudflare={status:'pending',reason:'尚未確認 Pages 專屬帳務資料'};
      if(dryRun) return json({status:'preview',results});
      const finished=await rpc('finish_admin_architecture_billing_run',{p_run_id:runId,p_results:results});
      if(finished!==true) throw Error('STORAGE_WRITE_FAILED');
      const succeeded=['github','railway'].filter(provider=>results[provider].status==='synced').length;
      return json({status:succeeded===2?'completed':succeeded===1?'partial':'failed',results:Object.fromEntries(Object.entries(results).map(([name,result])=>[name,{status:result.status,reason:result.reason}]))});
    } catch {
      if(runId) {
        try { await rpc('fail_admin_architecture_billing_run',{p_run_id:runId}); }
        catch { /* A later claim expires abandoned runs when storage recovers. */ }
      }
      return json({error:'SYNC_STORAGE_FAILED'},503);
    }
  };
}
