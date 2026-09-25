import { afterEach,describe,it,expect,vi } from 'vitest';
import { createSecurityMonitor } from './security-monitor';
const config=async()=>({url:'https://example.test',serviceRoleKey:'server-secret'});
const context={event:{requestContext:{http:{sourceIp:'203.0.113.7'}},headers:{'x-forwarded-for':'forged','authorization':'password'}}};
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe('security observation diagnostics', () => {
 const warningDetails = (warning: ReturnType<typeof vi.spyOn>) => JSON.parse(String(warning.mock.calls[0][1] ?? '{}'));

 it.each([
  { name: 'HTTP rejection', response: () => new Response('private upstream body', { status: 503 }), reason: 'http', stage: 'request', status: 503 },
  { name: 'database degradation', response: () => new Response(JSON.stringify({ allowed: true, retryAfter: 0, mode: 'observe', degraded: true })), reason: 'degraded', stage: 'response', status: undefined },
  { name: 'invalid response JSON', response: () => new Response('private upstream body'), reason: 'exception', stage: 'response', status: undefined },
 ])('identifies $name without logging upstream data', async ({ response, reason, stage, status }) => {
  const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const monitor = createSecurityMonitor(config, async () => response());
  expect(await monitor.check(context, 'admin_login')).toEqual({ allowed: true, retryAfter: 0, mode: 'observe' });
  expect(warning).toHaveBeenCalledTimes(1);
  expect(warning.mock.calls[0][0]).toBe('security-observation-unavailable');
  expect(warningDetails(warning)).toEqual({ reason, stage, category: 'admin_login', outcome: 'attempt', durationMs: expect.any(Number), ...(status ? { status } : {}) });
  expect(JSON.stringify(warning.mock.calls)).not.toMatch(/private upstream|203\.0\.113|forged|password|server-secret/);
 });

 it('identifies configuration failure without logging the thrown secret', async () => {
  const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const monitor = createSecurityMonitor(async () => { throw new Error('server-secret'); });
  await monitor.observe(context, 'unauthorized', 'denied');
  expect(warningDetails(warning)).toMatchObject({ reason: 'exception', stage: 'config', category: 'unauthorized', outcome: 'denied' });
  expect(JSON.stringify(warning.mock.calls)).not.toContain('server-secret');
 });

 it('reports the deadline stage and does not relabel a late failure as a new incident', async () => {
  vi.useFakeTimers();
  const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
  let rejectConfig!: (reason: Error) => void;
  const monitor = createSecurityMonitor(() => new Promise((_, reject) => { rejectConfig = reject; }));
  const result = monitor.check(context, 'admin_login');
  await vi.advanceTimersByTimeAsync(300);
  expect(await result).toEqual({ allowed: true, retryAfter: 0, mode: 'observe' });
  expect(warningDetails(warning)).toEqual({ reason: 'deadline', stage: 'config', category: 'admin_login', outcome: 'attempt', durationMs: 300 });
  await vi.advanceTimersByTimeAsync(60_000);
  rejectConfig(new Error('late private upstream failure'));
  await vi.advanceTimersByTimeAsync(0);
  expect(warning).toHaveBeenCalledTimes(1);
 });

 it('identifies capacity saturation and keeps one warning per minute across categories', async () => {
  vi.useFakeTimers();
  const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const monitor = createSecurityMonitor(() => new Promise(() => {}));
  const pending = Array.from({ length: 8 }, () => monitor.check(context, 'admin_login'));
  expect((await monitor.check(context, 'unauthorized')).allowed).toBe(true);
  expect(warningDetails(warning)).toMatchObject({ reason: 'capacity', stage: 'admission', category: 'unauthorized' });
  await vi.advanceTimersByTimeAsync(300);
  await Promise.all(pending);
  expect(warning).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(59_700);
  await monitor.check(context, 'admin_login');
  expect(warning).toHaveBeenCalledTimes(2);
 });

 it('keeps the 300 ms request deadline and aborts transport without retrying', async () => {
  vi.useFakeTimers();
  const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
  let signal: AbortSignal | null | undefined;
  let calls = 0;
  let started!: () => void;
  const requestStarted = new Promise<void>(resolve => { started = resolve; });
  const monitor = createSecurityMonitor(config, async (_url, init) => {
   calls++;
   signal = init?.signal;
   started();
   return new Promise<Response>((_resolve, reject) => signal?.addEventListener('abort', () => reject(new Error('private network error')), { once: true }));
  });
  const result = monitor.check(context, 'admin_login');
  await requestStarted;
  await vi.advanceTimersByTimeAsync(299);
  expect(warning).not.toHaveBeenCalled();
  expect(signal?.aborted).toBe(false);
  await vi.advanceTimersByTimeAsync(1);
  expect(await result).toEqual({ allowed: true, retryAfter: 0, mode: 'observe' });
  expect(signal?.aborted).toBe(true);
  expect(warningDetails(warning)).toMatchObject({ reason: 'deadline', stage: 'request', durationMs: 300 });
  expect(warning).toHaveBeenCalledTimes(1);
  expect(calls).toBe(1);
 });
});
describe('admin security observation',()=>{
 it('hashes trusted platform context and never forwards sensitive headers',async()=>{
  const calls:RequestInit[]=[];const monitor=createSecurityMonitor(config,async(_u,init)=>{calls.push(init!);return new Response(JSON.stringify({allowed:false,retryAfter:30,mode:'enforce'}));});
  expect(await monitor.check(context,'admin_login')).toEqual({allowed:false,retryAfter:30,mode:'enforce'});
  const body=JSON.parse(String(calls[0].body));expect(body.p_source).toMatch(/^[a-f0-9]{64}$/);expect(body.p_trusted).toBe(true);
  expect(String(calls[0].body)).not.toMatch(/203\.0\.113|forged|password|server-secret/);
 });
 it('enforces requests attributed by the Edge runtime verified client IP',async()=>{
  const calls:RequestInit[]=[];const monitor=createSecurityMonitor(config,async(_u,init)=>{calls.push(init!);return new Response(JSON.stringify({allowed:false,retryAfter:30,mode:'enforce'}));});
  expect(await monitor.check({event:{clientIp:'203.0.113.8',headers:{'x-forwarded-for':'192.0.2.9','x-matrix-client-ip':'192.0.2.10'}}},'admin_login')).toEqual({allowed:false,retryAfter:30,mode:'enforce'});
  expect(JSON.parse(String(calls[0].body)).p_trusted).toBe(true);
 });
 it('does not trust a signed-IP header or an invalid runtime IP',async()=>{
  const monitor=createSecurityMonitor(config,async()=>new Response(JSON.stringify({allowed:false,retryAfter:30,mode:'enforce'})));
  expect((await monitor.check({event:{clientIp:'invalid',headers:{'x-matrix-client-ip':'203.0.113.8'}}},'unauthorized')).allowed).toBe(true);
 });
 it('ignores forwarded headers and never enforces unattributed requests',async()=>{
  const monitor=createSecurityMonitor(config,async()=>new Response(JSON.stringify({allowed:false,retryAfter:30,mode:'enforce'})));
  expect((await monitor.check({event:{headers:{'x-forwarded-for':'1.2.3.4'}}},'admin_login')).allowed).toBe(true);
 });
 it('degrades safely and bounds time and outstanding work even if dependency ignores abort',async()=>{
  vi.useFakeTimers();let calls=0;
  const monitor=createSecurityMonitor(config,async()=>{calls++;return await new Promise<Response>(()=>{});});
  const checks=Array.from({length:20},()=>monitor.check(context,'admin_login'));
  await vi.advanceTimersByTimeAsync(301);expect((await Promise.all(checks)).every(x=>x.allowed)).toBe(true);expect(calls).toBeLessThanOrEqual(8);
  vi.useRealTimers();
 });
});
