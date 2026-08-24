let lineProviderToken: string | null = null;
let revokedForSupabaseAccessToken: string | null = null;

export function rememberLineProviderToken(token: unknown) {
  if (typeof token === 'string' && token.length > 0) {
    lineProviderToken = token;
  }
}

export function readLineProviderToken() {
  return lineProviderToken;
}

export function clearLineProviderToken() {
  lineProviderToken = null;
}

export function markLineProviderTokenRevokedFor(accessToken: unknown) {
  if (typeof accessToken === 'string' && accessToken.length > 0) {
    revokedForSupabaseAccessToken = accessToken;
  }
}

export function isLineProviderTokenRevokedFor(accessToken: unknown) {
  return typeof accessToken === 'string'
    && accessToken.length > 0
    && revokedForSupabaseAccessToken === accessToken;
}

export function clearLineAuthEphemeralState() {
  lineProviderToken = null;
  revokedForSupabaseAccessToken = null;
}
