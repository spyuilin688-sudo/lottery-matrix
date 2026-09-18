import { describe, expect, it, vi } from 'vitest';
import { MemberBootstrapError } from './member-bootstrap';
import { createMemberBootstrapRoutes } from './member-bootstrap-routes';

describe('member bootstrap routes', () => {
  it('forwards the Supabase authorization header and returns the member binding', async () => {
    const bootstrap = vi.fn(async () => ({ memberId: 'member-1', lineUserId: 'line-1' }));
    const api = createMemberBootstrapRoutes({ bootstrap });

    await expect(api.post({ authorization: 'Bearer token' })).resolves.toEqual({
      status: 200,
      body: { memberId: 'member-1', lineUserId: 'line-1' },
    });
    expect(bootstrap).toHaveBeenCalledWith('Bearer token');
  });

  it('preserves known bootstrap status and code', async () => {
    const api = createMemberBootstrapRoutes({
      bootstrap: async () => { throw new MemberBootstrapError('LINE_IDENTITY_CONFLICT', 409); },
    });

    await expect(api.post({ authorization: 'Bearer token' })).resolves.toEqual({
      status: 409,
      body: { error: { code: 'LINE_IDENTITY_CONFLICT' } },
    });
  });

  it('does not expose unknown backend failure details', async () => {
    const api = createMemberBootstrapRoutes({
      bootstrap: async () => { throw new Error('PRIVATE_SUPABASE_DETAIL'); },
    });

    await expect(api.post({ authorization: 'Bearer token' })).resolves.toEqual({
      status: 502,
      body: { error: { code: 'MEMBER_BOOTSTRAP_FAILED' } },
    });
  });
});
