// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RailwayOperations } from './RailwayOperations';

let root: Root;
let container: HTMLDivElement;
const button = (name: string) => [...container.querySelectorAll('button')].find(node => node.textContent === name)!;
const click = async (name: string) => { await act(async () => button(name).click()); };
const setup = async (canEdit = true) => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
  const client = { post: vi.fn(async (): Promise<{data: any}> => ({ data: { refresh: { lottery: '今彩539', period: '115211', drawDate: null } } })) };
  const confirm = vi.fn(async () => true);
  await act(async () => root.render(<RailwayOperations client={client} canEdit={canEdit} confirm={confirm} />));
  return { client, confirm };
};
afterEach(async () => { await act(async () => root?.unmount()); container?.remove(); });
describe('Railway operation controls', () => {
  it('submits only the selected lottery and displays the returned period', async () => {
    const { client, confirm } = await setup();
    const select = container.querySelector('select')!;
    await act(async () => { select.value = '大樂透'; select.dispatchEvent(new Event('change', { bubbles: true })); });
    client.post.mockResolvedValueOnce({ data: { refresh: { lottery: '大樂透', period: '115088', drawDate: null } } });
    await click('手動更新');
    expect(container.querySelector('[role=status]')?.textContent).toContain('大樂透 已手動更新至 115088 期');
    expect(confirm).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('大樂透') }));
    expect(client.post).toHaveBeenCalledExactlyOnceWith('/api/system-status/cron-matrix-649-refresh-v2/refresh');
  });
  it('does not send when confirmation is cancelled', async () => {
    const { client, confirm } = await setup(); confirm.mockResolvedValueOnce(false);
    await click('復原');
    expect(button('復原').disabled).toBe(false);
    expect(client.post).not.toHaveBeenCalled();
  });
  it('blocks duplicate actions and reports acceptance without claiming completion', async () => {
    const { client } = await setup();
    let finish!: (value: {data: any}) => void;
    client.post.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    await click('復原');
    expect(button('手動更新').disabled).toBe(true);
    expect(container.querySelector('select')?.disabled).toBe(true);
    await click('復原');
    expect(client.post).toHaveBeenCalledTimes(1);
    await act(async () => finish({ data: { recovery: { lottery: '今彩539', status: 'accepted' } } }));
    expect(container.querySelector('[role=status]')?.textContent).toContain('已受理復原，尚未完成');
    expect(client.post).toHaveBeenCalledExactlyOnceWith('/api/system-status/cron-matrix-539-refresh-v2/recover');
  });
  it('shows errors without automatically resubmitting', async () => {
    const { client } = await setup(); client.post.mockRejectedValueOnce(new Error('連線中斷'));
    await click('手動更新');
    expect(container.querySelector('[role=alert]')?.textContent).toContain('連線中斷');
    expect(client.post).toHaveBeenCalledTimes(1);
    expect(button('手動更新').disabled).toBe(false);
  });
  it('keeps read-only users from operating', async () => {
    const { client } = await setup(false);
    expect(button('復原').disabled).toBe(true); expect(button('手動更新').disabled).toBe(true);
    expect(container.textContent).toContain('目前帳號沒有編輯權限');
    await click('手動更新'); expect(client.post).not.toHaveBeenCalled();
  });
  it('rejects a mismatched server result instead of showing success', async () => {
    const { client } = await setup(); client.post.mockResolvedValueOnce({ data: { recovery: { lottery: '大樂透', status: 'accepted' } } });
    await click('復原');
    expect(container.querySelector('[role=alert]')?.textContent).toContain('未取得有效操作結果');
    expect(container.querySelector('[role=status]')).toBeNull();
  });
});
