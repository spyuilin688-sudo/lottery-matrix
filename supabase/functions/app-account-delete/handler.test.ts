import { beforeEach, expect, it, vi } from 'vitest';
import { createAppAccountDeleteHandler } from './handler';
const deps = { authenticate: vi.fn(), begin: vi.fn(), deleteAuth: vi.fn(), finalize: vi.fn() };
const request = (body = {}) => new Request('https://test/functions/v1/app-account-delete', { method: 'POST', headers: { authorization: 'Bearer verified', 'content-type': 'application/json' }, body: JSON.stringify(body) });
beforeEach(() => {
  vi.resetAllMocks(); deps.authenticate.mockResolvedValue({ userId: 'user', sessionId: 'session' });
  deps.begin.mockResolvedValue({ status: 'completed', authIdentity: 'retained', deletionId: 'job' });
});
it('uses only the verified user and retains shared Auth', async () => {
  const response = await createAppAccountDeleteHandler(deps)(request());
  expect(await response.json()).toEqual({ status: 'completed', authIdentity: 'retained' });
  expect(deps.begin).toHaveBeenCalledWith({ userId: 'user', sessionId: 'session' });
  expect(deps.deleteAuth).not.toHaveBeenCalled();
});
it('rejects arbitrary targets and invalid authentication', async () => {
  expect((await createAppAccountDeleteHandler(deps)(request({ memberId: 'victim' }))).status).toBe(400);
  deps.authenticate.mockResolvedValue(null);
  expect((await createAppAccountDeleteHandler(deps)(request())).status).toBe(401);
  expect(deps.begin).not.toHaveBeenCalled();
});
it('returns pending after Auth failure and completes a later verified retry', async () => {
  deps.begin.mockResolvedValue({ status: 'pending', authIdentity: 'pending', deletionId: 'job' });
  deps.deleteAuth.mockRejectedValueOnce(new Error('network')); deps.finalize.mockResolvedValue({ status: 'completed', authIdentity: 'deleted' });
  const handler = createAppAccountDeleteHandler(deps);
  const failed = await handler(request());
  expect(failed.status).toBe(202); expect(await failed.json()).toEqual({ status: 'pending', authIdentity: 'pending' });
  expect(await (await handler(request())).json()).toEqual({ status: 'completed', authIdentity: 'deleted' });
  expect(deps.deleteAuth).toHaveBeenLastCalledWith('user');
});
