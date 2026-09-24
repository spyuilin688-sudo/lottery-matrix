// @vitest-environment jsdom
import {act} from 'react';
import {createRoot, type Root} from 'react-dom/client';
import {afterEach, expect, it, vi} from 'vitest';
const mocks = vi.hoisted(() => ({get:vi.fn(),post:vi.fn()}));
vi.mock('./admin-platform-client', () => ({api:mocks, auth:{}}));
import {SystemSettings} from './AdminApp';
const id = 'cron-matrix-fantasy5-refresh-v2';
const requestId = '11111111-1111-4111-8111-111111111111';
const task = (status: string) => ({lottery:'天天樂',requestId,status,period:status==='complete'?'123':null,drawDate:null,error:null});
let root: Root;
let container: HTMLDivElement;
const render = async (canEdit=true) => act(async()=>root.render(<SystemSettings canEdit={canEdit} confirm={async()=>true}/>));
const setup = async () => {
  Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
  mocks.get.mockImplementation(async url => url === '/api/system-status' ? {data:{checkedAt:'2026-09-20T00:00:00Z',items:[{id,name:'天天樂',group:'爬蟲',location:'Supabase',endpoint:'test',checkMode:'service',ok:false,detail:{status:'failed'}}]}} : {data:{refresh:task('running')}});
  mocks.post.mockResolvedValue({data:{refresh:task('accepted')}});
  container=document.createElement('div');document.body.append(container);root=createRoot(container);await render();
};
const click = async (name:string) => act(async()=>{[...container.querySelectorAll('button')].find(b=>b.textContent===name)!.click();});
afterEach(async()=>{await act(async()=>root?.unmount());container?.remove();vi.useRealTimers();vi.resetAllMocks();});
it('stops the row poll on permission loss and resumes the same task with GET only',async()=>{
  vi.useFakeTimers();await setup();
  await click('手動更新開獎資料');
  expect(mocks.post).toHaveBeenCalledTimes(1);
  await render(false);
  const calls=mocks.get.mock.calls.length;
  await act(async()=>vi.advanceTimersByTimeAsync(10_000));
  expect(mocks.get).toHaveBeenCalledTimes(calls);
  expect(container.textContent).not.toContain('已手動更新至');
  await render(true);
  const original=mocks.get.getMockImplementation()!;
  mocks.get.mockImplementation(async url=>url.endsWith(requestId)?{data:{refresh:task('complete')}}:original(url));
  await click('查詢更新狀態');
  expect(container.textContent).toContain('天天樂 已手動更新至 123 期');
  expect(mocks.post).toHaveBeenCalledTimes(1);
});
it('retains the row task after a status network failure and cancels on unmount',async()=>{
  vi.useFakeTimers();await setup();
  mocks.get.mockRejectedValueOnce(new Error('查詢連線中斷'));
  await click('手動更新開獎資料');
  expect(container.textContent).toContain('查詢連線中斷');
  await click('查詢更新狀態');
  expect(mocks.post).toHaveBeenCalledTimes(1);
  const calls=mocks.get.mock.calls.length;
  await act(async()=>root.unmount());
  await act(async()=>vi.advanceTimersByTimeAsync(10_000));
  expect(mocks.get).toHaveBeenCalledTimes(calls);
});
