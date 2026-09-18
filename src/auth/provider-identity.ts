export type ProviderIdentity = {
  label: 'LINE ID' | 'Google ID';
  value: string;
};

function optionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function providerIdentityFromSession(session: unknown): ProviderIdentity | null {
  if (!session || typeof session !== 'object') return null;
  const user = (session as { user?: unknown }).user;
  if (!user || typeof user !== 'object') return null;
  const identities = (user as { identities?: unknown }).identities;
  if (!Array.isArray(identities)) return null;

  const providerId = (provider: string) => {
    const identity = identities.find((candidate) => (
      candidate && typeof candidate === 'object'
      && (candidate as { provider?: unknown }).provider === provider
    ));
    if (!identity || typeof identity !== 'object') return null;
    const direct = optionalString((identity as { provider_id?: unknown }).provider_id);
    if (direct) return direct;
    const identityData = (identity as { identity_data?: unknown }).identity_data;
    if (!identityData || typeof identityData !== 'object') return null;
    return optionalString((identityData as { sub?: unknown }).sub);
  };

  const lineId = providerId('custom:line');
  if (lineId) return { label: 'LINE ID', value: lineId };
  const googleId = providerId('google');
  if (googleId) return { label: 'Google ID', value: googleId };
  return null;
}
