import { beforeEach, expect, it, vi } from 'vitest';
import { createAppAdmin } from './app-admin';
const supabaseRequest = vi.fn();
const api = createAppAdmin({ supabaseRequest });
const owner = { id: '11111111-1111-4111-8111-111111111111', account: 'spyuilin688@gmail.com', role: '超級管理員', status: '啟用' };
beforeEach(() => supabaseRequest.mockReset());
it('requires the server-loaded active owner, including on reads', async () => {
  for (const actor of [null, { ...owner, role: '營運' }, { ...owner, account: 'other@example.com' }, { ...owner, status: '停用' }]) {
    await expect(api.list('users', {}, actor as never)).rejects.toMatchObject({ statusCode: 403 });
  }
  expect(supabaseRequest).not.toHaveBeenCalled();
});
it('passes only the verified actor and App inputs to SQL', async () => {
  supabaseRequest.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 25 });
  await api.list('users', { page: '1', account: 'forged', role: 'super' }, owner);
  expect(supabaseRequest).toHaveBeenCalledWith('rpc/app_admin_list', expect.objectContaining({ body: JSON.stringify({ p_actor_id: owner.id, p_view: 'users', p_page: 1, p_page_size: 25, p_query: '' }) }));
});
it('preserves report failures and returns true empty reports', async () => {
  supabaseRequest.mockRejectedValueOnce(new Error('offline'));
  await expect(api.revenue(owner)).rejects.toThrow('offline');
  supabaseRequest.mockResolvedValueOnce({ transactionCount: 0, totalsByCurrency: [] });
  await expect(api.revenue(owner)).resolves.toEqual({ transactionCount: 0, totalsByCurrency: [] });
});
it('maps conflict and missing member errors and rejects unsafe status bodies', async () => {
  supabaseRequest.mockRejectedValueOnce(new Error('APP_REVISION_CONFLICT'));
  await expect(api.setStatus(owner.id, { status: 'disabled', expectedRevision: 1 }, owner)).rejects.toMatchObject({ statusCode: 409 });
  supabaseRequest.mockRejectedValueOnce(new Error('APP_MEMBER_NOT_FOUND'));
  await expect(api.setStatus(owner.id, { status: 'disabled', expectedRevision: 1 }, owner)).rejects.toMatchObject({ statusCode: 404 });
  await expect(api.setStatus(owner.id, { status: 'active' }, owner)).rejects.toMatchObject({ statusCode: 400 });
});
