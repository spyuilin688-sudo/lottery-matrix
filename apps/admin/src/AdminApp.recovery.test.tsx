// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import AdminApp from './AdminApp';
const client = vi.hoisted(()=>({get:vi.fn(),post:vi.fn(),put:vi.fn(),delete:vi.fn()}));
vi.mock('@appdeploy/client',()=>({api:client,auth:{signIn:vi.fn(),signOut:vi.fn()}}));
afterEach(()=>{cleanup();vi.clearAllMocks();});
describe('AdminApp weak-network bootstrap',()=>{
  it.each(['missing-metadata', 'repeated-page'])('rejects %s plan pages instead of treating a partial options list as complete', async (kind) => {
    client.get.mockImplementation(async (path: string) => {
      if (path === '/api/bootstrap') return { data: { admin: { id: 'admin-1', name: 'Owner', role: '超級管理員' } } };
      if (path === '/api/dashboard') return { data: {} };
      if (path.startsWith('/api/data/plans?')) return kind === 'missing-metadata'
        ? { data: { items: [{ id: 'partial-plan' }] } }
        : { data: { items: [{ id: 'first-plan' }], total: 2, currentPage: 1, totalPages: 2 } };
      return { data: { items: [], total: 0, currentPage: 1, totalPages: 1 } };
    });
    render(<AdminApp />);
    fireEvent.click(await screen.findByRole('button', { name: /訂閱管理/ }));
    expect(await screen.findByText(kind === 'missing-metadata' ? 'Invalid admin page' : '方案列表分頁資料不完整，請重新載入')).toBeTruthy();
    expect(screen.queryByText('資料處理中…')).toBeNull();
    expect(client.get.mock.calls.filter(([path]) => path.startsWith('/api/data/plans?'))).toHaveLength(kind === 'missing-metadata' ? 1 : 2);
  });
  it.each(['success', 'failure'])('does not let a stale dashboard %s clear the newer request busy/error state', async (outcome) => {
    let finishOld!: (value: unknown) => void;
    let rejectOld!: (cause: Error) => void;
    let finishNew!: (value: unknown) => void;
    const old = new Promise((resolve, reject) => { finishOld = resolve; rejectOld = reject; });
    const next = new Promise(resolve => { finishNew = resolve; });
    let dashboards = 0;
    client.get.mockImplementation(async (path: string) => {
      if (path === '/api/bootstrap') return { data: { admin: { id: 'admin-1', name: 'Owner', role: '超級管理員' } } };
      if (path === '/api/dashboard') return ++dashboards === 1 ? old : next;
      return { data: { items: [], total: 0, currentPage: 1, totalPages: 1 } };
    });
    render(<AdminApp />);
    fireEvent.click(await screen.findByRole('button', { name: /收入報表/ }));
    await waitFor(() => expect(dashboards).toBe(2));
    await act(async () => { if (outcome === 'success') finishOld({ data: { monthRevenue: 999 } }); else rejectOld(new Error('old dashboard failed')); });
    expect(screen.getByText('資料處理中…')).toBeTruthy();
    expect(screen.queryByText('old dashboard failed')).toBeNull();
    await act(async () => finishNew({ data: { todayRevenue: 12, monthRevenue: 34, quarterRevenue: 56, yearRevenue: 78, cumulativeRevenue: 90 } }));
    expect(screen.queryByText('資料處理中…')).toBeNull();
    expect(screen.getByText('$34')).toBeTruthy();
    expect(screen.queryByText('$999')).toBeNull();
  });
  it('shows a connection retry and recovers using the session without asking for credentials',async()=>{
    let online=false;
    client.get.mockImplementation(async (path:string)=>{
      if(path==='/api/bootstrap') {
        if(!online) throw Object.assign(new Error('Service unavailable'),{status:503});
        return {data:{admin:{id:'admin-1',name:'Owner',role:'超級管理員'}}};
      }
      return {data:[]};
    });
    render(<AdminApp/>);
    expect((await screen.findByRole('alert')).textContent).toContain('後台連線異常');
    expect(screen.queryByLabelText('管理員帳號')).toBeNull();
    online=true;
    fireEvent.click(screen.getByRole('button',{name:'重新載入'}));
    await waitFor(()=>expect(screen.getByTitle('登出')).toBeTruthy());
    expect(client.post).not.toHaveBeenCalled();
  });
  it('shows login after a confirmed invalid session',async()=>{
    client.get.mockRejectedValue(Object.assign(new Error('Expired'),{status:401}));
    render(<AdminApp/>);
    await waitFor(()=>expect(client.get).toHaveBeenCalledWith('/api/bootstrap'));
    expect(screen.getByLabelText('管理員帳號')).toBeTruthy();
    expect(screen.queryByText('後台連線異常，請重新載入')).toBeNull();
  });
});
