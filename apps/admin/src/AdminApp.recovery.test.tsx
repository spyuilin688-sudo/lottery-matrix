// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import AdminApp from './AdminApp';
const dashboard = {
  todayVisitors: 0, monthVisitors: 0, totalVisitors: 0, totalUsers: 0,
  monthlyPro: 0, quarterlyPro: 0, yearlyPro: 0, expiring: 0,
  todayRevenue: 0, monthRevenue: 0, quarterRevenue: 0, yearRevenue: 0, cumulativeRevenue: 0,
  userGrowth: [], revenueGrowth: [],
};
const client = vi.hoisted(()=>({get:vi.fn(),post:vi.fn(),put:vi.fn(),delete:vi.fn()}));
vi.mock('@appdeploy/client',()=>({api:client,auth:{signIn:vi.fn(),signOut:vi.fn()}}));
afterEach(()=>{cleanup();vi.clearAllMocks();});
describe('AdminApp weak-network bootstrap',()=>{
  it('reuses the revenue reset identity after an uncertain response and creates a new one after success', async () => {
    client.get.mockImplementation(async (path: string) => {
      if (path === '/api/bootstrap') return { data: { admin: { id: 'admin-1', name: 'Owner', role: '超級管理員' } } };
      if (path === '/api/dashboard') return { data: dashboard };
      return { data: { items: [], total: 0, currentPage: 1, totalPages: 1 } };
    });
    client.post.mockRejectedValueOnce(new Error('NETWORK_TIMEOUT')).mockResolvedValue({ data: { resetAt: '2026-09-23T00:00:00Z' } });
    render(<AdminApp />);
    fireEvent.click(await screen.findByRole('button', { name: /收入報表/ }));
    const reset = async () => {
      fireEvent.click(await screen.findByRole('button', { name: '重設收入' }));
      fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: '確認重設' }));
    };
    await reset();
    await waitFor(() => expect(screen.getByText('NETWORK_TIMEOUT')).toBeTruthy());
    await reset();
    await waitFor(() => expect(client.post).toHaveBeenCalledTimes(2));
    expect(client.post.mock.calls[0][1]).toEqual(client.post.mock.calls[1][1]);
    expect(client.post.mock.calls[0][1].requestId).toMatch(/^[0-9a-f-]{36}$/i);
    await screen.findByRole('button', { name: '重設收入' });
    await reset();
    await waitFor(() => expect(client.post).toHaveBeenCalledTimes(3));
    expect(client.post.mock.calls[2][1].requestId).not.toBe(client.post.mock.calls[0][1].requestId);
  });

  it('reuses the reset identity when the reset succeeds but reading the dashboard fails', async () => {
    let failDashboardRead = false;
    client.get.mockImplementation(async (path: string) => {
      if (path === '/api/bootstrap') return { data: { admin: { id: 'admin-1', name: 'Owner', role: '超級管理員' } } };
      if (path === '/api/dashboard') {
        if (failDashboardRead) { failDashboardRead = false; throw new Error('DASHBOARD_DOWN'); }
        return { data: dashboard };
      }
      return { data: { items: [], total: 0, currentPage: 1, totalPages: 1 } };
    });
    client.post.mockImplementation(async () => {
      failDashboardRead = client.post.mock.calls.length === 1;
      return { data: { resetAt: '2026-09-23T00:00:00Z' } };
    });
    render(<AdminApp />);
    fireEvent.click(await screen.findByRole('button', { name: /收入報表/ }));
    const reset = async () => {
      fireEvent.click(await screen.findByRole('button', { name: '重設收入' }));
      fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: '確認重設' }));
    };
    await reset();
    await waitFor(() => expect(screen.getByText('DASHBOARD_DOWN')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /收入報表/ }));
    await reset();
    await waitFor(() => expect(client.post).toHaveBeenCalledTimes(2));
    expect(client.post.mock.calls[1][1]).toEqual(client.post.mock.calls[0][1]);
  });

  it('does not reuse one administrator’s uncertain reset after another administrator signs in', async () => {
    let actorId = 'admin-1';
    let resetCalls = 0;
    client.get.mockImplementation(async (path: string) => {
      if (path === '/api/bootstrap') return { data: { admin: { id: actorId, name: 'Owner', role: '超級管理員' } } };
      if (path === '/api/dashboard') return { data: dashboard };
      return { data: { items: [], total: 0, currentPage: 1, totalPages: 1 } };
    });
    client.post.mockImplementation(async (path: string) => {
      if (path === '/api/revenue/reset' && ++resetCalls === 1) throw new Error('NETWORK_TIMEOUT');
      if (path === '/api/admin-login') actorId = 'admin-2';
      return { data: {} };
    });
    render(<AdminApp />);
    fireEvent.click(await screen.findByRole('button', { name: /收入報表/ }));
    const reset = async () => {
      fireEvent.click(await screen.findByRole('button', { name: '重設收入' }));
      fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: '確認重設' }));
    };
    await reset();
    await waitFor(() => expect(screen.getByText('NETWORK_TIMEOUT')).toBeTruthy());
    fireEvent.click(screen.getByTitle('登出'));
    fireEvent.change(await screen.findByLabelText('管理員帳號'), { target: { value: 'next@example.com' } });
    fireEvent.change(screen.getByLabelText('密碼'), { target: { value: 'password' } });
    fireEvent.click(screen.getByRole('button', { name: '登入營運後台' }));
    fireEvent.click(await screen.findByRole('button', { name: /收入報表/ }));
    await reset();
    await waitFor(() => expect(client.post.mock.calls.filter(([path]) => path === '/api/revenue/reset')).toHaveLength(2));
    const resets = client.post.mock.calls.filter(([path]) => path === '/api/revenue/reset');
    expect(resets[1][1].requestId).not.toBe(resets[0][1].requestId);
  });

  it('shows member name without exposing LINE/Google ID in user management', async () => {
    client.get.mockImplementation(async (path: string) => {
      if (path === '/api/bootstrap') return { data: { admin: { id: 'admin-1', name: 'Owner', role: '超級管理員' } } };
      if (path === '/api/dashboard') return { data: dashboard };
      if (path.startsWith('/api/data/users?')) return { data: { items: [{
        id: 'member-1',
        memberDisplayName: '蔡源輝',
        identityDisplay: 'LINE ID：U123456',
        registeredAt: '2026-09-15T06:01:45.508Z',
        lastOnlineAt: '2026-09-16T02:40:00.000Z',
        recentOnlineMinutes: 10,
        status: 'active',
        recentIp: null,
        estimatedRegion: null,
      }], total: 1, currentPage: 1, totalPages: 1 } };
      return { data: { items: [], total: 0, currentPage: 1, totalPages: 1 } };
    });
    render(<AdminApp />);
    fireEvent.click(await screen.findByRole('button', { name: /用戶管理/ }));
    expect(await screen.findByRole('columnheader', { name: '會員名稱' })).toBeTruthy();
    expect(screen.queryByRole('columnheader', { name: 'LINE ID／Google ID' })).toBeNull();
    expect(await screen.findByText('蔡源輝')).toBeTruthy();
    expect(screen.queryByText('LINE ID：U123456')).toBeNull();
  });

  it.each(['missing-metadata', 'repeated-page'])('rejects %s plan pages instead of treating a partial options list as complete', async (kind) => {
    client.get.mockImplementation(async (path: string) => {
      if (path === '/api/bootstrap') return { data: { admin: { id: 'admin-1', name: 'Owner', role: '超級管理員' } } };
      if (path === '/api/dashboard') return { data: dashboard };
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
    await act(async () => { if (outcome === 'success') finishOld({ data: { ...dashboard, monthRevenue: 999 } }); else rejectOld(new Error('old dashboard failed')); });
    expect(screen.getByText('資料處理中…')).toBeTruthy();
    expect(screen.queryByText('old dashboard failed')).toBeNull();
    await act(async () => finishNew({ data: { ...dashboard, todayRevenue: 12, monthRevenue: 34, quarterRevenue: 56, yearRevenue: 78, cumulativeRevenue: 90 } }));
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
      if(path==='/api/dashboard') return {data:dashboard};
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
