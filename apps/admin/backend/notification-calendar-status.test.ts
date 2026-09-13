import { describe,expect,it,vi } from 'vitest';
import { createConnectionStatus } from './connection-status';

const endpoint='https://db.test/rest/v1/rpc/notification_draw_calendar_status';
const fixture=()=>({ lottery:'六合彩',status:'已確認',checked_at:'2026-09-13T12:00:00Z',last_checked_at:'2026-09-13T11:43:00Z',last_success_at:'2026-09-13T11:43:15Z',valid_until:'2026-09-14T13:43:15Z',coverage_start:'2026-09-01',coverage_end:'2026-09-30',next_draw_date:'2026-09-15',is_draw_day_today:false,message:'今天沒有排定開獎，不發送選號提醒。' });
const check=async(body:unknown,httpStatus=200)=>{
  const fetcher=vi.fn(async(input:RequestInfo|URL)=>Response.json(String(input)===endpoint?body:[],{status:String(input)===endpoint?httpStatus:200}));
  const result=await createConnectionStatus({
    supabase:{selectRows:async()=>[]},loadConfig:async()=>({url:'https://db.test',serviceRoleKey:'server-secret'}),
    getWorkerStatus:async()=>({ok:false,reason:'APPDEPLOY_CONFIG_MISSING',health:null,jobs:null}),
    now:()=>new Date('2026-09-13T12:00:00Z'),fetcher,requestTimeoutMs:25,
  }).get();
  return {item:result.items.find(x=>x.id==='notification-calendar'),fetcher};
};
describe('official notification calendar health in existing service status',()=>{
  it('shows a confirmed non-draw day as healthy through one service-only read',async()=>{
    const {item,fetcher}=await check({...fixture(),secret:'must-not-leak'});
    expect(item).toMatchObject({ok:true,healthState:'healthy',detail:fixture(),checkEvidence:'reported'});
    expect(fetcher.mock.calls.filter(([url])=>String(url)===endpoint)).toHaveLength(1);
    expect(fetcher).toHaveBeenCalledWith(endpoint,expect.objectContaining({method:'GET',headers:{apikey:'server-secret',Authorization:'Bearer server-secret'}}));
    expect(JSON.stringify(item)).not.toMatch(/server-secret|must-not-leak/);
  });
  it('reports pending confirmation and its pause reason',async()=>{
    const body={...fixture(),status:'待確認',message:'官方日期待確認，六合彩選號提醒暫停。',valid_until:null,last_success_at:null,coverage_start:null,coverage_end:null,next_draw_date:null};
    expect((await check(body)).item).toMatchObject({ok:false,healthState:'waiting',error:body.message,detail:{status:'待確認'}});
  });
  it.each([null,{},[],{...fixture(),status:'invented'},{...fixture(),valid_until:'2026-09-12T12:00:00Z'},{...fixture(),is_draw_day_today:'false'},{...fixture(),next_draw_date:'2026-02-31'},{...fixture(),checked_at:'yesterday'}])('malformed or stale payload remains unknown: %j',async body=>{
    expect((await check(body)).item).toMatchObject({ok:false,healthState:'unknown'});
  });
  it('does not expose raw backend errors or claim a pause when the health request fails',async()=>{
    const {item}=await check({message:'internal SQL details'},503);
    expect(item).toMatchObject({ok:false,healthState:'unknown',error:'六合彩開獎日曆狀態暫時無法取得。'});
    expect(JSON.stringify(item)).not.toContain('internal SQL');
  });
});
