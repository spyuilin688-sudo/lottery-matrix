type Dependencies = { getEnv(name: string): string | undefined; fetch: typeof fetch };
type RecordValue = Record<string, unknown>;
const object = (value: unknown): RecordValue => value && typeof value === 'object' && !Array.isArray(value) ? value as RecordValue : {};
const displayText = (value: unknown) => typeof value === 'string' && value.length <= 200 ? value : undefined;

export function createHandler(deps: Dependencies) {
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
    status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
  async function probe(url: string, token: string, provider: 'cloudflare' | 'github') {
    try {
      const response = await deps.fetch(url, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json',
          ...(provider === 'github' ? { 'X-GitHub-Api-Version': '2026-03-10' } : {}) },
        signal: AbortSignal.timeout(12000), redirect: 'error',
      });
      if (!response.ok) {
        const failure=provider==='cloudflare' ? object(await response.json().catch(()=>({}))) : {};
        const codes=Array.isArray(failure.errors) ? failure.errors.map(item=>object(item).code).filter(code=>typeof code==='number') : [];
        return { status: 'api_rejected', httpStatus: response.status, codes };
      }
      const body = object(await response.json());
      if (provider === 'cloudflare' && body.success !== true) return { status: 'api_rejected', httpStatus: response.status };
      const rows = provider === 'github' ? body.usageItems : body.result;
      return {
        status: 'readable', httpStatus: response.status,
        ...(url.endsWith('/entitlements') && Array.isArray(rows) ? {
          allocations: rows.slice(0,200).map(item=>{
            const entry=object(item), allocation=object(entry.allocation);
            return {id:displayText(entry.id),type:displayText(allocation.type),value:typeof allocation.value==='number'&&Number.isFinite(allocation.value)?allocation.value:undefined};
          }),
        } : {}),
        ...(url.endsWith('/billing/unpaid-invoice') ? {
          unpaid: Array.isArray(object(rows).invoices) ? (object(rows).invoices as unknown[]).map(item => {
            const entry=object(item);
            return {amountToPay:typeof entry.amount_to_pay==='number'&&Number.isFinite(entry.amount_to_pay)?entry.amount_to_pay:undefined,currency:displayText(entry.currency)};
          }) : null,
        } : {}),
        ...(url.includes('/billing/history?') && Array.isArray(rows) ? {
          history: rows.map(item => {
            const entry=object(item);
            return {amount:typeof entry.amount==='number'&&Number.isFinite(entry.amount)?entry.amount:undefined,
              currency:displayText(entry.currency),status:displayText(entry.status),type:displayText(entry.type),
              occurredAt:displayText(entry.occurred_at)};
          }),
          totalCount: typeof object(body.result_info).total_count==='number' ? object(body.result_info).total_count : undefined,
        } : {}),
        ...(url.endsWith('/accounts/2a0ab3c9c14b3d669c035efa1bc60fe4/subscriptions') && Array.isArray(rows) ? {
          plans: rows.slice(0,30).map(item => {
            const subscription=object(item),plan=object(subscription.rate_plan);
            return {name:displayText(plan.public_name),scope:displayText(plan.scope),id:displayText(plan.id),price:typeof subscription.price==='number'&&Number.isFinite(subscription.price)?subscription.price:undefined,currency:displayText(subscription.currency),frequency:displayText(subscription.frequency)};
          }),
        } : {}),
        ...(url.endsWith('/billable-usage/info') && typeof object(rows).covered==='boolean' ? {covered:object(rows).covered} : {}),
        ...(Array.isArray(rows) ? {
          count: rows.length,
          // Account identifiers only. Never return tokens, invoices or signed URLs.
          ...(url.endsWith('/accounts?per_page=50') ? {
            accounts: rows.map(item => object(item).id).filter(id => typeof id === 'string' && /^[a-f0-9]{32}$/.test(id)),
          } : {}),
        } : {}),
      };
    } catch { return { status: 'request_failed' }; }
  }
  async function probeRailway(token: string, details = false) {
    try {
      const response = await deps.fetch('https://backboard.railway.com/graphql/v2', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `query BillingAccess($workspaceId: String!) {
            workspace(workspaceId: $workspaceId) {
              id
              customer {
                currentUsage
                billingPeriod { start end }
                invoices { total status periodStart periodEnd }
                subscriptions { nextInvoiceCurrentTotal nextInvoiceDate }
              }
            }
          }`,
          variables: { workspaceId: '8b32b524-e3de-4ad2-a37d-4d641bca491a' },
        }),
        signal: AbortSignal.timeout(12000), redirect: 'error',
      });
      if (!response.ok) {
        await response.body?.cancel();
        return { status: 'api_rejected', httpStatus: response.status };
      }
      const body = object(await response.json());
      const workspace = object(object(body.data).workspace);
      const customer = object(workspace.customer);
      if ((Array.isArray(body.errors) && body.errors.length > 0)
        || workspace.id !== '8b32b524-e3de-4ad2-a37d-4d641bca491a'
        || typeof customer.currentUsage !== 'number'
        || !Number.isFinite(customer.currentUsage)
        || !Array.isArray(customer.invoices) || !Array.isArray(customer.subscriptions)) {
        return { status: 'api_rejected', httpStatus: response.status };
      }
      return { status: 'readable', httpStatus: response.status,
        invoiceCount: customer.invoices.length, subscriptionCount: customer.subscriptions.length,
        ...(details ? {billingPeriod: {start:displayText(object(customer.billingPeriod).start)??null,end:displayText(object(customer.billingPeriod).end)??null},
          nextInvoices:customer.subscriptions.slice(0,30).map(value=>{
            const subscription=object(value);
            return {date:displayText(subscription.nextInvoiceDate)??null,
              totalCents:Number.isSafeInteger(subscription.nextInvoiceCurrentTotal)?subscription.nextInvoiceCurrentTotal:null};
          })} : {}),
      };
    } catch { return { status: 'request_failed' }; }
  }
  return async (request: Request) => {
    if (request.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405);
    const expected = deps.getEnv('MATRIX_NOTIFICATION_DISPATCH_TOKEN')?.trim();
    const supplied = request.headers.get('x-matrix-dispatch-token') ?? '';
    if (!expected || supplied.length !== expected.length) return json({ error: 'UNAUTHORIZED' }, 401);
    let difference = 0;
    for (let i = 0; i < expected.length; i++) difference |= supplied.charCodeAt(i) ^ expected.charCodeAt(i);
    if (difference !== 0) return json({ error: 'UNAUTHORIZED' }, 401);
    const options=object(await request.json().catch(()=>({})));
    const cf = deps.getEnv('CLOUDFLARE_BILLING_API_TOKEN')?.trim();
    const gh = (deps.getEnv('GITHUB_BILLING_API_TOKEN') || deps.getEnv('GITHUB_ACTIONS_TOKEN'))?.trim();
    const rw = deps.getEnv('RAILWAY_BILLING_API_TOKEN')?.trim();
    const now = new Date();
    const [cloudflare, github, railway] = await Promise.all([
      cf ? Promise.all([
        probe('https://api.cloudflare.com/client/v4/user/tokens/verify', cf, 'cloudflare'),
        probe('https://api.cloudflare.com/client/v4/user/subscriptions', cf, 'cloudflare'),
        probe('https://api.cloudflare.com/client/v4/accounts?per_page=50', cf, 'cloudflare'),
      ]).then(async ([token, subscriptions, accounts]) => {
        if(options.cloudflareDetails!==true) return {status:'checked',token,subscriptions,accounts};
        const base='https://api.cloudflare.com/client/v4/accounts/2a0ab3c9c14b3d669c035efa1bc60fe4';
        const [pages,accountSubscriptions,usageInfo,billingHistory,unpaidInvoices,entitlements,usageV2]=await Promise.all([
          probe(`${base}/pages/projects/lottery-matrix`,cf,'cloudflare'),
          probe(`${base}/subscriptions`,cf,'cloudflare'),
          probe(`${base}/billable-usage/info`,cf,'cloudflare'),
          probe(`${base}/billing/history?page=1&per_page=20`,cf,'cloudflare'),
          probe(`${base}/billing/unpaid-invoice`,cf,'cloudflare'),
          probe(`${base}/entitlements`,cf,'cloudflare'),
          probe(`${base}/billable/usage`,cf,'cloudflare'),
        ]);
        return {status:'checked',token,subscriptions,accounts,pages,accountSubscriptions,usageInfo,billingHistory,unpaidInvoices,entitlements,usageV2};
      })
        : { status: 'missing_credential' },
      gh ? probe(`https://api.github.com/users/spyuilin688-sudo/settings/billing/usage?year=${now.getUTCFullYear()}&month=${now.getUTCMonth()+1}`, gh, 'github')
        : { status: 'missing_credential' },
      rw ? probeRailway(rw, options.railwayDetails===true) : { status: 'missing_billing_credential' },
    ]);
    return json({ cloudflare, github, railway,
      supabase: { status: deps.getEnv('SUPABASE_BILLING_API_TOKEN') ? 'credential_present_unverified' : 'missing_billing_credential' },
    });
  };
}
