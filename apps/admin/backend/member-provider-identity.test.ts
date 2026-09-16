import { describe, expect, it } from 'vitest';
import { providerIdentityFromAuthUser } from './member-provider-identity';

describe('providerIdentityFromAuthUser', () => {
  it('uses the stored LINE ID when the member has LINE identity', () => {
    expect(providerIdentityFromAuthUser('line-user-123', {
      identities: [{ provider: 'custom:line', provider_id: 'line-user-123' }],
    })).toEqual({ label: 'LINE ID', value: 'line-user-123' });
  });

  it('uses Google provider_id when no LINE ID exists', () => {
    expect(providerIdentityFromAuthUser(null, {
      identities: [{ provider: 'google', provider_id: 'google-user-456' }],
    })).toEqual({ label: 'Google ID', value: 'google-user-456' });
  });

  it('does not expose the internal auth UUID as a display identity', () => {
    expect(providerIdentityFromAuthUser(null, { id: 'internal-auth-uuid', identities: [] })).toBeNull();
  });
});
