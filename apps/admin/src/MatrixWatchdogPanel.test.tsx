// @vitest-environment jsdom
import {cleanup,render,screen} from '@testing-library/react';
import {afterEach,expect,it} from 'vitest';
import {MatrixWatchdogPanel} from './MatrixWatchdogPanel';
afterEach(cleanup);
it('distinguishes missing evidence and accepted recovery from success',()=>{
 render(<MatrixWatchdogPanel detail={{checkedAt:'2026-09-19T00:00:00Z',completedAt:'2026-09-19T00:00:00Z',reports:[{lottery:'天天樂',drawPeriod:'12004',checkedAt:'2026-09-19T00:00:00Z',stages:[]}],actions:[{lottery:'天天樂',target:'railway',reasons:['analysis-missing'],outcome:'accepted'}]}} now={new Date('2026-09-19T00:01:00Z')} />);
 expect(screen.getAllByText('證據不足').length).toBeGreaterThan(0);
 expect(screen.getByText(/已受理，等待資料驗證/)).toBeTruthy();
 expect(screen.getByText(/根因尚未確認/)).toBeTruthy();
});
it('shows stale observations and unavailable optimizer explicitly',()=>{
 render(<MatrixWatchdogPanel detail={{checkedAt:'2026-09-19T00:00:00Z',completedAt:'2026-09-19T00:00:00Z'}} now={new Date('2026-09-20T00:00:00Z')} />);
 expect(screen.getByText(/觀察已過期/)).toBeTruthy();
 expect(screen.getByText(/尚未執行深度檢查/)).toBeTruthy();
});

it('shows independent source freshness and the approved cadence',()=>{
 render(<MatrixWatchdogPanel detail={{checkedAt:'2026-09-20T02:00:00Z',completedAt:'2026-09-20T02:00:00Z',optimizer:{checkedAt:'2026-09-20T02:00:00Z',candidates:[],coverage:[],retentionDays:90,sourceChecks:{railway:'2026-09-20T02:00:00Z'}}}} now={new Date('2026-09-20T02:01:00Z')} />);
 expect(screen.getByText(/觀察保留 90 天/)).toBeTruthy();
 expect(screen.getByText('Railway 最近檢查')).toBeTruthy();
 expect(screen.getByText('資料庫最近檢查').nextElementSibling?.textContent).toBe('尚無紀錄');
});

const passedReport = {lottery:'今彩539',drawPeriod:'115000228',checkedAt:'2026-09-19T21:34:49Z',stages:['schedule','job','crawler','draw','analysis','matrix-status','card'].map(stage=>({stage,state:'PASS',period:'115000228',observedAt:'2026-09-19T21:34:49Z',source:'test',code:'PASS'}))};
it('names a failed card publication and its status',()=>{
 const report = {...passedReport,stages:passedReport.stages.map(stage=>stage.stage==='card'?{...stage,state:'FAIL'}:stage)};
 render(<MatrixWatchdogPanel detail={{checkedAt:'2026-09-19T21:34:49Z',completedAt:'2026-09-19T21:34:50Z',reports:[report]}} now={new Date('2026-09-19T21:35:00Z')}/>);
 expect(screen.getByText('牌單').nextElementSibling?.textContent).toBe('異常');
});
it('does not describe a passed chain as an unlocated fault',()=>{
 render(<MatrixWatchdogPanel detail={{status:'ok',checkedAt:'2026-09-19T21:34:49Z',completedAt:'2026-09-19T21:34:50Z',reports:[passedReport]}} now={new Date('2026-09-19T21:35:00Z')}/>);
 expect(screen.queryByText(/尚未定位故障層/)).toBeNull();
 expect(screen.getByText(/資料鏈未發現異常/)).toBeTruthy();
});
it('labels retained evidence as historical during a verified idle schedule',()=>{
 render(<MatrixWatchdogPanel detail={{status:'ok',checkedAt:'2026-09-19T21:34:49Z',completedAt:'2026-09-19T21:34:50Z',reports:[passedReport],schedule:{checkedAt:'2026-09-19T21:53:00Z',due:false,pendingSince:null}}} now={new Date('2026-09-19T21:56:00Z')}/>);
 expect(screen.queryByText(/觀察已過期/)).toBeNull();
 expect(screen.getByText(/未到指定檢查時點/)).toBeTruthy();
 expect(screen.getByText('上次已驗證')).toBeTruthy();
});

const currentReports = ['今彩539','天天樂','六合彩','大樂透'].map(lottery=>({...passedReport,lottery,checkedAt:'2026-09-19T21:55:00Z',stages:passedReport.stages.map(stage=>({...stage,observedAt:'2026-09-19T21:55:00Z'}))}));
it('shows current read-only evidence separately from the historical recovery heartbeat',()=>{
 render(<MatrixWatchdogPanel detail={{status:'degraded',checkedAt:'2026-09-19T21:34:49Z',completedAt:'2026-09-19T21:34:50Z',
  reports:currentReports,
  actions:[{lottery:'今彩539',target:'railway',reasons:['analysis-missing'],outcome:'accepted'}],
  observation:{checkedAt:'2026-09-19T21:55:00Z',status:'ok',source:'read-only-chain'},
  schedule:{checkedAt:'2026-09-19T21:55:00Z',due:false,pendingSince:null}}} now={new Date('2026-09-19T21:56:00Z')}/>);
 expect(screen.queryByText(/非本次重新驗證/)).toBeNull();
 expect(screen.queryByText('上次已驗證')).toBeNull();
 expect(screen.getByText(/本次為資料鏈唯讀檢查/)).toBeTruthy();
 expect(screen.getByText(/上次恢復請求：已受理/)).toBeTruthy();
 expect(document.querySelector('.matrixWatchdogPanel > header span')?.textContent).toContain('05:55');
});

it('does not promote expired read-only evidence or a stale scheduler to a current check',()=>{
 render(<MatrixWatchdogPanel detail={{status:'degraded',checkedAt:'2026-09-19T21:34:49Z',completedAt:'2026-09-19T21:34:50Z',
  reports:currentReports,observation:{checkedAt:'2026-09-19T21:55:00Z',status:'ok',source:'read-only-chain'},
  schedule:{checkedAt:'2026-09-19T21:55:00Z',due:false,pendingSince:null}}} now={new Date('2026-09-19T23:00:00Z')}/>);
 expect(screen.getByText(/觀察已過期/)).toBeTruthy();
 expect(screen.queryByText(/本次為資料鏈唯讀檢查/)).toBeNull();
 expect(screen.getAllByText('待重新確認')).toHaveLength(4);
});
