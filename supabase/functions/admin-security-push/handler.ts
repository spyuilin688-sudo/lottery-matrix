export type SecurityPushJob = { id: string; lease_token: string; subscription_id: string; admin_id: string; group_id: string; category: string; event_count: number; endpoint: string; p256dh: string; auth_key: string };
export type PushPayload = { kind: 'security'; count: number; title: string; body: string; url: string; tag: string };
export type Outcome = 'sent' | 'retry' | 'failed' | 'skipped';
export type Dependencies = {
  dispatchToken: string;
  claim(): Promise<SecurityPushJob[]>;
  eligible(job: SecurityPushJob): Promise<boolean>;
  sendPush(job: SecurityPushJob, payload: PushPayload): Promise<void>;
  finish(job: SecurityPushJob, outcome: Outcome, disable: boolean): Promise<boolean>;
};
function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
}

function constantTimeEqual(left: string, right: string) {
  const a = new TextEncoder().encode(left);
  const b = new TextEncoder().encode(right);
  let difference = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    difference |= (a[i] ?? 0) ^ (b[i] ?? 0);
  }
  return difference === 0;
}

// Keep this provider policy aligned with the admin registration endpoint.
function allowedEndpoint(endpoint: string) {
  if (endpoint.length > 4096 || /[\s\\#]/.test(endpoint)) return false;
  try {
    const url = new URL(endpoint);
    const authority = endpoint.match(/^https:\/\/([^/\?#]+)/)?.[1];
    const host = url.hostname;
    const allowed = host === 'fcm.googleapis.com'
      || host === 'push.services.mozilla.com' || host.endsWith('.push.services.mozilla.com')
      || host === 'web.push.apple.com' || host.endsWith('.web.push.apple.com')
      || host === 'notify.windows.com' || host.endsWith('.notify.windows.com');
    return !!authority && !authority.includes(':') && url.protocol === 'https:'
      && !url.username && !url.password && !url.port && allowed;
  } catch {
    return false;
  }
}

export function createAdminSecurityPushHandler(dependencies: Dependencies) {
  return async (request: Request): Promise<Response> => {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { Allow: 'POST, OPTIONS' } });
    if (request.method !== 'POST') return json({ error: { code: 'METHOD_NOT_ALLOWED' } }, 405);
    const token = request.headers.get('x-matrix-dispatch-token') ?? '';
    if (!token) return json({ error: { code: 'AUTH_REQUIRED' } }, 401);
    if (!dependencies.dispatchToken || !constantTimeEqual(token, dependencies.dispatchToken)) {
      return json({ error: { code: 'INVALID_TOKEN' } }, 403);
    }
    try {
      const jobs = await dependencies.claim();
      const totals = { claimed: jobs.length, sent: 0, skipped: 0, retried: 0, failed: 0, errors: 0 };
      await Promise.all(jobs.map(async job => {
        try {
          let outcome: Outcome;
          let disable = false;
          if (!allowedEndpoint(job.endpoint)) {
            outcome = 'failed';
            disable = true;
          } else if (!await dependencies.eligible(job)) {
            outcome = 'skipped';
          } else {
            try {
              await dependencies.sendPush(job, {
                kind: 'security',
                count: Math.max(1, Math.min(2147483646, Math.floor(job.event_count))),
                title: '安全監控提醒',
                body: '偵測到異常請求量，請檢查服務安全紀錄。',
                url: './',
                tag: `admin-security-${job.group_id}`,
              });
              outcome = 'sent';
            } catch (cause) {
              const status = cause && typeof cause === 'object' ? Reflect.get(cause, 'statusCode') : undefined;
              disable = status === 404 || status === 410;
              outcome = typeof status === 'number' && status >= 400 && status < 500 && status !== 429
                ? 'failed' : 'retry';
            }
          }
          // Count only lease-guarded persisted outcomes; stale completions are failures.
          if (!await dependencies.finish(job, outcome, disable)) throw new Error('FINALIZE_FAILED');
          totals[outcome === 'retry' ? 'retried' : outcome]++;
        } catch {
          totals.errors++;
        }
      }));
      return json(totals, totals.errors ? 500 : 200);
    } catch {
      return json({ error: { code: 'DISPATCH_FAILED' } }, 500);
    }
  };
}
