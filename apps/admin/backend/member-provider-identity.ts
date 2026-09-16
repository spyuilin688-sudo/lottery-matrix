export type AdminProviderIdentity = {
  label: 'LINE ID' | 'Google ID';
  value: string;
};

export type AuthUserIdentity = {
  provider?: unknown;
  provider_id?: unknown;
  identity_data?: Record<string, unknown> | null;
};

export type AuthUserForIdentity = {
  id?: unknown;
  identities?: AuthUserIdentity[] | null;
};

function optionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function providerIdentityFromAuthUser(
  lineUserId: unknown,
  authUser: AuthUserForIdentity | undefined | null,
): AdminProviderIdentity | null {
  const storedLineId = optionalString(lineUserId);
  if (storedLineId) return { label: 'LINE ID', value: storedLineId };

  const google = authUser?.identities?.find((identity) => identity.provider === 'google');
  const googleId = optionalString(google?.provider_id)
    ?? optionalString(google?.identity_data?.sub);
  return googleId ? { label: 'Google ID', value: googleId } : null;
}
