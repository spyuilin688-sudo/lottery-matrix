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
