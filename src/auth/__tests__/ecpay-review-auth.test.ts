import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ login: vi.fn(), rpc: vi.fn(), setSession: vi.fn(), signOut: vi.fn() }));
vi.mock('../../lib/supabase', () => ({
  createEcpayReviewAuthClient: () => ({ auth: { signInWithPassword: mocks.login, signOut: mocks.signOut }, rpc: mocks.rpc }),
  getSupabaseClient: () => ({ auth: { setSession: mocks.setSession } }),
}));
import { signInForEcpayReview } from '../ecpay-review-auth';
beforeEach(() => {
  vi.resetAllMocks();
  mocks.login.mockResolvedValue({ data: { session: { access_token: 'test-access', refresh_token: 'test-refresh' } }, error: null });
  mocks.rpc.mockResolvedValue({ data: true, error: null });
  mocks.setSession.mockResolvedValue({ error: null });
  mocks.signOut.mockResolvedValue({ error: null });
});
describe('dedicated review session handoff', () => {
  it('publishes a session only after server-side review membership confirmation', async () => {
    await signInForEcpayReview(' review@example.test ', 'test-password');
    expect(mocks.login).toHaveBeenCalledWith({ email: 'review@example.test', password: 'test-password' });
    expect(mocks.rpc).toHaveBeenCalledWith('ecpay_review_access');
    expect(mocks.setSession).toHaveBeenCalledWith({ access_token: 'test-access', refresh_token: 'test-refresh' });
  });
  it.each([false, null])('does not publish a non-review or unavailable membership session (%s)', async (data) => {
    mocks.rpc.mockResolvedValue({ data, error: null });
    await expect(signInForEcpayReview('other@example.test', 'test-password')).rejects.toThrow('REVIEW_LOGIN_FAILED');
    expect(mocks.setSession).not.toHaveBeenCalled();
  });
  it('does not publish a session after a cancelled form receives a late result', async () => {
    const controller = new AbortController();
    mocks.rpc.mockImplementation(async () => { controller.abort(); return { data: true, error: null }; });
    await expect(signInForEcpayReview('review@example.test', 'test-password', controller.signal)).rejects.toThrow();
    expect(mocks.setSession).not.toHaveBeenCalled();
  });
  it('keeps password errors generic and never replaces the current member', async () => {
    mocks.login.mockResolvedValue({ data: { session: null }, error: { message: 'invalid credentials' } });
    await expect(signInForEcpayReview('review@example.test', 'wrong')).rejects.toThrow('REVIEW_LOGIN_FAILED');
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.setSession).not.toHaveBeenCalled();
  });
});

it('awaits an in-progress session commit rather than reporting cancellation while it can still publish', async () => {
  const controller = new AbortController();
  const commit = vi.fn(() => controller.abort());
  mocks.setSession.mockImplementation(async () => ({ error: null }));
  await expect(signInForEcpayReview('review@example.test', 'test-password', controller.signal, commit)).resolves.toBeUndefined();
  expect(commit).toHaveBeenCalledOnce();
  expect(mocks.setSession).toHaveBeenCalledOnce();
});
