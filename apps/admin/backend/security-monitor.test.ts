import { describe,it,expect,vi } from 'vitest';
import { createSecurityMonitor } from './security-monitor';
const config=async()=>({url:'https://example.test',serviceRoleKey:'server-secret'});
const context={event:{requestContext:{http:{sourceIp:'203.0.113.7'}},headers:{'x-forwarded-for':'forged','authorization':'password'}}};
describe('admin security observation',()=>{
 it('hashes trusted platform context and never forwards sensitive headers',async()=>{
  const calls:RequestInit[]=[];const monitor=createSecurityMonitor(config,async(_u,init)=>{calls.push(init!);return new Response(JSON.stringify({allowed:false,retryAfter:30,mode:'enforce'}));});
  expect(await monitor.check(context,'admin_login')).toEqual({allowed:false,retryAfter:30,mode:'enforce'});
  const body=JSON.parse(String(calls[0].body));expect(body.p_source).toMatch(/^[a-f0-9]{64}$/);expect(body.p_trusted).toBe(true);
  expect(String(calls[0].body)).not.toMatch(/203\.0\.113|forged|password|server-secret/);
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
