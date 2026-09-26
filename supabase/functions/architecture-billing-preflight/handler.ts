type Dependencies = { getEnv(name: string): string | undefined; fetch: typeof fetch };
type RecordValue = Record<string, unknown>;
const object = (value: unknown): RecordValue => value && typeof value === 'object' && !Array.isArray(value) ? value as RecordValue : {};

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
        await response.body?.cancel();
        return { status: 'api_rejected', httpStatus: response.status };
      }
      const body = object(await response.json());
      if (provider === 'cloudflare' && body.success !== true) return { status: 'api_rejected', httpStatus: response.status };
      const rows = provider === 'github' ? body.usageItems : body.result;
      return {
        status: 'readable', httpStatus: response.status,
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
  async function probeRailway(token: string) {
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
        invoiceCount: customer.invoices.length, subscriptionCount: customer.subscriptions.length };
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
    const cf = deps.getEnv('CLOUDFLARE_BILLING_API_TOKEN')?.trim();
    const gh = (deps.getEnv('GITHUB_BILLING_API_TOKEN') || deps.getEnv('GITHUB_ACTIONS_TOKEN'))?.trim();
    const rw = deps.getEnv('RAILWAY_BILLING_API_TOKEN')?.trim();
    const now = new Date();
    const [cloudflare, github, railway] = await Promise.all([
      cf ? Promise.all([
        probe('https://api.cloudflare.com/client/v4/user/tokens/verify', cf, 'cloudflare'),
        probe('https://api.cloudflare.com/client/v4/user/subscriptions', cf, 'cloudflare'),
        probe('https://api.cloudflare.com/client/v4/accounts?per_page=50', cf, 'cloudflare'),
      ]).then(([token, subscriptions, accounts]) => ({ status: 'checked', token, subscriptions, accounts }))
        : { status: 'missing_credential' },
      gh ? probe(`https://api.github.com/users/spyuilin688-sudo/settings/billing/usage?year=${now.getUTCFullYear()}&month=${now.getUTCMonth()+1}`, gh, 'github')
        : { status: 'missing_credential' },
      rw ? probeRailway(rw) : { status: 'missing_billing_credential' },
    ]);
    return json({ cloudflare, github, railway,
      supabase: { status: deps.getEnv('SUPABASE_BILLING_API_TOKEN') ? 'credential_present_unverified' : 'missing_billing_credential' },
    });
  };
}
