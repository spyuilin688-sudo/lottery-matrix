import { describe, expect, it } from 'vitest';
import { loadAdminBootstrap, createActivationBatchSubmitter } from './admin-recovery';
describe('admin bootstrap recovery', () => {
  it.each([new TypeError('offline'), {status:503}, {statusCode:504}, new Error('network')])('keeps a failed bootstrap distinct from an invalid session', async error => {
    expect(await loadAdminBootstrap({get:async () => { throw error; }})).toMatchObject({kind:'unavailable'});
  });
  it.each([{status:401},{statusCode:403},{response:{status:401}}])('recognizes explicit authentication rejection', async error => {
    expect(await loadAdminBootstrap({get:async () => { throw error; }})).toMatchObject({kind:'unauthorized'});
  });
  it('can recover with the same session on retry', async () => {
    let offline = true;
    const client = {get:async () => { if(offline) throw new TypeError('offline'); return {data:{admin:{id:'a'}}}; }};
    expect(await loadAdminBootstrap(client)).toMatchObject({kind:'unavailable'});
    offline = false;
    expect(await loadAdminBootstrap(client)).toEqual({kind:'ready',admin:{id:'a'}});
  });
});
describe('activation operation retry identity', () => {
  it('reuses the same request after lost response and creates a fresh identity after success', async () => {
    const requests: any[] = [];
    let offline = true;
    const submitter = createActivationBatchSubmitter({post:async (_path, body) => {
      requests.push(body); if(offline) throw new TypeError('lost response'); return {data:{count:3}};
    }});
    await expect(submitter.submit('admin-1','7_days',3)).rejects.toThrow('lost response');
    offline = false;
    await submitter.submit('admin-1','7_days',3);
    expect(requests[1].requestId).toBe(requests[0].requestId);
    expect(requests[0].requestId).toMatch(/^[\da-f-]{36}$/i);
    await submitter.submit('admin-1','7_days',3);
    expect(requests[2].requestId).not.toBe(requests[0].requestId);
  });
  it('does not reuse an operation after actor or input changes', async () => {
    const requests: any[] = [];
    const submitter = createActivationBatchSubmitter({post:async (_path, body) => {requests.push(body);throw Error('offline');}});
    for(const [actor, duration, quantity] of [['a','7_days',3],['b','7_days',3],['b','15_days',3]] as const) await submitter.submit(actor, duration, quantity).catch(()=>{});
    expect(new Set(requests.map(r=>r.requestId)).size).toBe(3);
  });
});

function retryStorage() {
  const data = new Map<string, string>();
  return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); }, removeItem: (key: string) => { data.delete(key); } };
}

describe('activation retry across form and page reopening', () => {
  it('preserves an ambiguous operation after a new submitter is created and clears it after success', async () => {
    const storage = retryStorage();
    const requests: Array<{ requestId: string }> = [];
    let unavailable = true;
    const client = { post: async (_path: string, body: unknown) => {
      requests.push(body as { requestId: string });
      if (unavailable) throw Error('response lost');
      return { data: { count: 3 } };
    } };
    await createActivationBatchSubmitter(client, storage).submit('a', '7_days', 3).catch(() => {});
    unavailable = false;
    await createActivationBatchSubmitter(client, storage).submit('a', '7_days', 3);
    expect(requests[1].requestId).toBe(requests[0].requestId);
    await createActivationBatchSubmitter(client, storage).submit('a', '7_days', 3);
    expect(requests[2].requestId).not.toBe(requests[0].requestId);
  });

  it('retains separate pending identities for A, B, then A including actor changes', async () => {
    const storage = retryStorage();
    const requests: Array<{ requestId: string }> = [];
    const client = { post: async (_path: string, body: unknown) => { requests.push(body as { requestId: string }); throw Error('response lost'); } };
    const submitter = createActivationBatchSubmitter(client, storage);
    for (const [actor, duration] of [['a','7_days'],['a','15_days'],['b','7_days'],['a','7_days']]) {
      await submitter.submit(actor, duration, 3).catch(() => {});
    }
    expect(new Set(requests.slice(0,3).map(request => request.requestId)).size).toBe(3);
    expect(requests[3].requestId).toBe(requests[0].requestId);
    await createActivationBatchSubmitter(client, storage).submit('a', '15_days', 3).catch(() => {});
    expect(requests[4].requestId).toBe(requests[1].requestId);
  });

  it('keeps in-memory recovery available when session storage throws', async () => {
    const denied = () => { throw Error('storage denied'); };
    const requests: Array<{ requestId: string }> = [];
    const submitter = createActivationBatchSubmitter({ post: async (_path, body) => { requests.push(body as { requestId: string }); throw Error('response lost'); } }, { getItem: denied, setItem: denied, removeItem: denied });
    for (const duration of ['7_days','15_days','7_days']) await submitter.submit('a', duration, 3).catch(() => {});
    expect(requests).toHaveLength(3);
    expect(requests[2].requestId).toBe(requests[0].requestId);
  });
});

it('starts a fresh operation after success even when persisted identity cannot be removed', async () => {
  const values = retryStorage();
  const storage = { ...values, removeItem: () => { throw Error('storage became unavailable'); } };
  const requests: Array<{requestId:string}> = [];
  const submitter = createActivationBatchSubmitter({post:async (_path,body)=>{requests.push(body as {requestId:string});return {}; }},storage);
  await submitter.submit('a','7_days',3);
  await submitter.submit('a','7_days',3);
  expect(requests[1].requestId).not.toBe(requests[0].requestId);
});
