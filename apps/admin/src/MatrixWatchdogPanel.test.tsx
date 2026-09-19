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

import {CHAIN_STAGES} from '../backend/matrix-chain';
const healthyDetail={status:'ok',checkedAt:'2026-09-19T17:33:00Z',completedAt:'2026-09-19T17:34:00Z',nextCheckAt:'2026-09-19T18:33:00Z',reports:[{lottery:'今彩539',drawPeriod:'115000228',checkedAt:'2026-09-19T17:33:00Z',stages:CHAIN_STAGES.map(stage=>({stage,state:'PASS',source:'supabase',period:'115000228',observedAt:'2026-09-19T17:33:00Z',code:'VERIFIED'}))}]};
it('does not expire a healthy observation while awaiting its hourly checkpoint',()=>{
 render(<MatrixWatchdogPanel detail={healthyDetail} now={new Date('2026-09-19T18:20:00Z')}/>);
 expect(screen.queryByText(/觀察已過期/)).toBeNull();
 expect(screen.queryByText('待重新確認')).toBeNull();
 expect(screen.getByText('本次資料鏈檢查未發現異常。')).toBeTruthy();
 expect(screen.queryByText(/根因尚未確認/)).toBeNull();
});
it('still expires when the next checkpoint and grace period have passed',()=>{
 render(<MatrixWatchdogPanel detail={healthyDetail} now={new Date('2026-09-19T18:42:00Z')}/>);
 expect(screen.getByText(/觀察已過期/)).toBeTruthy();
 expect(screen.getByText('待重新確認')).toBeTruthy();
});
