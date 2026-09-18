import type { SupabaseConfig } from './supabase';
export type SecurityContext = { event?: { requestContext?: { http?: { sourceIp?: string } }; headers?: Record<string,string|undefined> } };
type Category = 'admin_login' | 'unauthorized';
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
  function warn() {
    if (Date.now() - lastWarning >= 60_000) {
      lastWarning = Date.now();
      console.warn('security-observation-unavailable');
    }
  }
  async function send(ctx: SecurityContext, category: Category, outcome: 'attempt'|'denied'|'success'|'invalid'): Promise<Decision> {
    if (active >= 8) { warn(); return allow(); }
    active++;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const deadline = new Promise<Decision>(resolve => { timer = setTimeout(() => { controller.abort(); warn(); resolve(allow()); }, 300); });
    const operation = (async () => {
      try {
        const config = await loadConfig();
        if (controller.signal.aborted) return allow();
        // Only platform-populated context is trusted. Never use forwarded/request headers.
        const address = canonicalIp(ctx.event?.requestContext?.http?.sourceIp ?? '');
        const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(config.serviceRoleKey), {name:'HMAC',hash:'SHA-256'}, false, ['sign']);
        const digest = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(address ?? 'unattributed'));
        const source = [...new Uint8Array(digest)].map(n => n.toString(16).padStart(2,'0')).join('');
        if (controller.signal.aborted) return allow();
        const response = await fetcher(`${config.url.replace(/\/+$/,'')}/rest/v1/rpc/security_observe`, {
          method:'POST',signal:controller.signal,redirect:'error',headers:{'Content-Type':'application/json',apikey:config.serviceRoleKey,Authorization:`Bearer ${config.serviceRoleKey}`},
          body:JSON.stringify({p_category:category,p_source:source,p_trusted:address !== null,p_outcome:outcome}),
        });
        if (!response.ok) { warn(); return allow(); }
        const result = await response.json();
        if (result?.degraded) warn();
        return address && result?.mode === 'enforce' && result?.allowed === false && Number.isInteger(result.retryAfter) && result.retryAfter >= 1 && result.retryAfter <= 3600
          ? {allowed:false,retryAfter:result.retryAfter,mode:'enforce'} as Decision : allow();
      } catch { warn(); return allow(); }
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
