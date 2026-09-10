// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import AdminApp from './AdminApp';
const client = vi.hoisted(()=>({get:vi.fn(),post:vi.fn(),put:vi.fn(),delete:vi.fn()}));
vi.mock('@appdeploy/client',()=>({api:client,auth:{signIn:vi.fn(),signOut:vi.fn()}}));
afterEach(()=>{cleanup();vi.clearAllMocks();});
describe('AdminApp weak-network bootstrap',()=>{
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
