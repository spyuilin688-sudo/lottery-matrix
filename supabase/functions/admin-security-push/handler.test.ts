import { describe, expect, it } from 'vitest';
import { createAdminSecurityPushHandler, type SecurityPushJob, type Dependencies } from './handler';

const job: SecurityPushJob = {
  id: 'queue-id', lease_token: 'lease', subscription_id: 'subscription', admin_id: 'admin',
  group_id: 'group', category:'public_query', event_count:123, endpoint: 'https://fcm.googleapis.com/fcm/send/token',
  p256dh: 'public-key', auth_key: 'auth-key',
};
function fixture(overrides: Partial<Dependencies> = {}) {
  const events: string[] = [];
  const finished: Array<[string, boolean]> = [];
  const payloads: unknown[] = [];
  const dependencies: Dependencies = {
    dispatchToken: 'dispatch-secret',
    claim: async () => { events.push('claim'); return [job]; },
    eligible: async () => { events.push('eligible'); return true; },
    sendPush: async (_job, payload) => { events.push('send'); payloads.push(payload); },
    finish: async (_job, outcome, disable) => { events.push('finish'); finished.push([outcome, disable]); return true; },
    ...overrides,
  };
  return { handler: createAdminSecurityPushHandler(dependencies), events, finished, payloads };
}
function request(token: string | null = 'dispatch-secret', method = 'POST') {
  return new Request('https://example.com/functions/v1/admin-security-push', {
    method, headers: token ? { 'x-matrix-dispatch-token': token } : {},
  });
}

describe('admin security push dispatch', () => {
  it('answers a read-only OPTIONS probe without claiming or sending any jobs', async () => {
    const f = fixture();
    const response = await f.handler(request(null, 'OPTIONS'));
    expect(response.status).toBe(204);
    expect(response.headers.get('Allow')).toBe('POST, OPTIONS');
    expect(await response.text()).toBe('');
    expect(f.events).toEqual([]);
    expect(f.finished).toEqual([]);
    expect(f.payloads).toEqual([]);
  });
  it.each([null, 'denied', 'dispatch-secreu'])('denies token %s without claiming', async token => {
    const f = fixture();
    expect((await f.handler(request(token))).status).toBe(token ? 403 : 401);
    expect(f.events).toEqual([]);
  });
  it('rejects non-POST without claiming', async () => {
    const f = fixture();
    expect((await f.handler(request('dispatch-secret', 'GET'))).status).toBe(405);
    expect(f.events).toEqual([]);
  });
  it('rechecks eligibility immediately before send and completes generic notification', async () => {
    const f = fixture();
    const response = await f.handler(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ claimed: 1, sent: 1, skipped: 0, retried: 0, failed: 0, errors: 0 });
    expect(f.events).toEqual(['claim', 'eligible', 'send', 'finish']);
    expect(f.finished).toEqual([['sent', false]]);
    expect(f.payloads).toEqual([{ kind:'security', count:123, title: '安全監控提醒', body: '偵測到異常請求量，請檢查服務安全紀錄。', url: './', tag: 'admin-security-group' }]);
  });
  it('skips a no longer pending or authorized job', async () => {
    const f = fixture({ eligible: async () => false });
    const response = await f.handler(request());
    expect((await response.json()).skipped).toBe(1);
    expect(f.payloads).toEqual([]);
    expect(f.finished).toEqual([['skipped', false]]);
  });
  it.each([404, 410])('disables terminal endpoint status %s', async statusCode => {
    const f = fixture({ sendPush: async () => { throw { statusCode }; } });
    await f.handler(request());
    expect(f.finished).toEqual([['failed', true]]);
  });
  it.each([undefined, 429, 500, 503])('retries transient status %s', async statusCode => {
    const f = fixture({ sendPush: async () => { throw { statusCode }; } });
    const response = await f.handler(request());
    expect((await response.json()).retried).toBe(1);
    expect(f.finished).toEqual([['retry', false]]);
  });
  it.each([400, 401, 403])('fails other HTTP client status %s without disabling', async statusCode => {
    const f = fixture({ sendPush: async () => { throw { statusCode }; } });
    await f.handler(request());
    expect(f.finished).toEqual([['failed', false]]);
  });
  it.each(['http://fcm.googleapis.com/a', 'https://127.0.0.1/a', 'https://fcm.googleapis.com.evil.test/a', 'https://user:pass@fcm.googleapis.com/a', 'https://fcm.googleapis.com:8443/a', 'https://evil.test/a', 'https://web.push.apple.com:443/a', 'https://web.push.apple.com/a#', 'https://web.push.apple.com\\a'])('blocks unsafe endpoint %s', async endpoint => {
    const f = fixture({ claim: async () => [{ ...job, endpoint }] });
    await f.handler(request());
    expect(f.payloads).toEqual([]);
    expect(f.finished).toEqual([['failed', true]]);
  });
  it.each(['https://web.push.apple.com/token', 'https://updates.push.services.mozilla.com/wpush/v2/token', 'https://push.services.mozilla.com/a', 'https://eu.push.services.mozilla.com/a', 'https://us.web.push.apple.com/a', 'https://notify.windows.com/a', 'https://wns.notify.windows.com/a'])('sends to supported endpoint %s', async endpoint => {
    const f = fixture({ claim: async () => [{ ...job, endpoint }] });
    expect((await f.handler(request())).status).toBe(200);
    expect(f.payloads).toHaveLength(1);
  });
  it.each([false, new Error('private backend endpoint')])('reports completion failures instead of false success', async result => {
    const f = fixture({ finish: async () => { if (result instanceof Error) throw result; return result; } });
    const response = await f.handler(request());
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ claimed: 1, sent: 0, skipped: 0, retried: 0, failed: 0, errors: 1 });
  });
  it('does not send when eligibility lookup fails', async () => {
    const f = fixture({ eligible: async () => { throw new Error('secret'); } });
    const response = await f.handler(request());
    expect(response.status).toBe(500);
    expect(f.payloads).toEqual([]);
    expect(f.finished).toEqual([]);
    expect(await response.text()).not.toContain('secret');
  });
  it('sanitizes claim errors', async () => {
    const f = fixture({ claim: async () => { throw new Error('secret'); } });
    const response = await f.handler(request());
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain('secret');
  });
});
