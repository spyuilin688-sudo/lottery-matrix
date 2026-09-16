// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { providerIdentityFromSession } from '../auth/provider-identity';

describe('providerIdentityFromSession', () => {
  it('returns LINE ID for a LINE identity', () => {
    expect(providerIdentityFromSession({
      user: {
        identities: [{ provider: 'custom:line', provider_id: 'line-user-123' }],
      },
    })).toEqual({ label: 'LINE ID', value: 'line-user-123' });
  });

  it('returns Google ID for a Google identity even when the auth user was originally email', () => {
    expect(providerIdentityFromSession({
      user: {
        app_metadata: { provider: 'email' },
        identities: [{ provider: 'email', provider_id: 'email-user' }, { provider: 'google', provider_id: 'google-user-456' }],
      },
    })).toEqual({ label: 'Google ID', value: 'google-user-456' });
  });

  it('never falls back to the internal Supabase user UUID', () => {
    expect(providerIdentityFromSession({ user: { id: 'internal-auth-uuid', identities: [] } })).toBeNull();
  });
});
