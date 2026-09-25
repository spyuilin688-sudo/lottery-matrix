import type { SupabaseConfig } from './supabase';
export type SecurityContext = { event?: { clientIp?: string; requestContext?: { http?: { sourceIp?: string } }; headers?: Record<string,string|undefined> } };
type Category = 'admin_login' | 'unauthorized';
type ObservationStage = 'admission' | 'config' | 'identity' | 'request' | 'response';
type ObservationFailure = 'capacity' | 'deadline' | 'http' | 'degraded' | 'exception';
type Decision = { allowed: boolean; retryAfter: number; mode: 'observe' | 'enforce' };
const allow = (): Decision => ({ allowed: true, retryAfter: 0, mode: 'observe' });
function canonicalIp(value: string) {
  if (value.length > 45 || /[^0-9a-fA-F:.]/.test(value)) return null;
  if (value.includes(':')) { try { return new URL(`http://[${value}]/`).hostname; } catch { return null; } }
  const parts = value.split('.');
  return parts.length === 4 && parts.every(p => /^(0|[1-9][0-9]{0,2})$/.test(p) && Number(p) <= 255) ? value : null;
}
export function createSecurityMonitor(loadConfig: () => Promise<SupabaseConfig>, fetcher: typeof fetch = fetch) {
  let active = 0;
  let lastWarning = -Infinity;
  async function send(ctx: SecurityContext, category: Category, outcome: 'attempt'|'denied'|'success'|'invalid'): Promise<Decision> {
    const startedAt = Date.now();
    let stage: ObservationStage = 'admission';
    let reported = false;
    const warn = (reason: ObservationFailure, status?: number) => {
      // A timed-out operation may fail much later; retain its original cause.
      if (reported) return;
      reported = true;
      if (Date.now() - lastWarning >= 60_000) {
        lastWarning = Date.now();
        // Fixed categories and numeric metadata only: never include upstream
        // bodies, exception messages, credentials, addresses or request headers.
        console.warn('security-observation-unavailable', JSON.stringify({
          reason, stage, category, outcome, durationMs: Math.max(0, Date.now() - startedAt),
          ...(status === undefined ? {} : { status }),
        }));
      }
    };
    if (active >= 8) { warn('capacity'); return allow(); }
    active++;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const deadline = new Promise<Decision>(resolve => { timer = setTimeout(() => { warn('deadline'); controller.abort(); resolve(allow()); }, 300); });
    const operation = (async () => {
      try {
        stage = 'config';
        const config = await loadConfig();
        if (controller.signal.aborted) return allow();
        stage = 'identity';
        // clientIp is populated only after Edge proxy signature verification.
        // Keep the trusted AWS transport compatible; never read request headers.
        const address = canonicalIp(ctx.event?.clientIp ?? '')
          ?? canonicalIp(ctx.event?.requestContext?.http?.sourceIp ?? '');
        const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(config.serviceRoleKey), {name:'HMAC',hash:'SHA-256'}, false, ['sign']);
        const digest = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(address ?? 'unattributed'));
        const source = [...new Uint8Array(digest)].map(n => n.toString(16).padStart(2,'0')).join('');
        if (controller.signal.aborted) return allow();
        stage = 'request';
        const response = await fetcher(`${config.url.replace(/\/+$/,'')}/rest/v1/rpc/security_observe`, {
          method:'POST',signal:controller.signal,redirect:'error',headers:{'Content-Type':'application/json',apikey:config.serviceRoleKey,Authorization:`Bearer ${config.serviceRoleKey}`},
          body:JSON.stringify({p_category:category,p_source:source,p_trusted:address !== null,p_outcome:outcome}),
        });
        if (!response.ok) { warn('http', response.status); return allow(); }
        stage = 'response';
        const result = await response.json();
        if (result?.degraded) warn('degraded');
        return address && result?.mode === 'enforce' && result?.allowed === false && Number.isInteger(result.retryAfter) && result.retryAfter >= 1 && result.retryAfter <= 3600
          ? {allowed:false,retryAfter:result.retryAfter,mode:'enforce'} as Decision : allow();
      } catch { warn('exception'); return allow(); }
      finally { active--; }
    })();
    try { return await Promise.race([operation, deadline]); }
    finally { clearTimeout(timer!); }
  }
  return {
    check: (ctx:SecurityContext, category:Category) => send(ctx,category,'attempt'),
    observe: async(ctx:SecurityContext,category:Category,outcome:'denied'|'success'|'invalid') => { await send(ctx,category,outcome); },
  };
}
