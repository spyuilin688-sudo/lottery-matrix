import { describe, expect, it } from 'vitest';
import { isLineProviderSession, sessionAuthProvider } from '../session-provider';

function session(provider?: string, identities?: Array<{ provider?: string }>) {
  return {
    user: {
      app_metadata: provider ? { provider } : {},
      identities,
    },
  } as never;
}

describe('session provider detection', () => {
  it('recognizes a LINE OAuth session', () => {
    const value = session('custom:line');
    expect(sessionAuthProvider(value)).toBe('custom:line');
    expect(isLineProviderSession(value)).toBe(true);
  });

  it('does not classify a Google OAuth session as LINE', () => {
    const value = session('google');
    expect(sessionAuthProvider(value)).toBe('google');
    expect(isLineProviderSession(value)).toBe(false);
  });

  it('uses a single identity when app metadata has no provider', () => {
    const value = session(undefined, [{ provider: 'google' }]);
    expect(sessionAuthProvider(value)).toBe('google');
    expect(isLineProviderSession(value)).toBe(false);
  });

  it('does not guess when multiple identities are ambiguous', () => {
    const value = session(undefined, [{ provider: 'custom:line' }, { provider: 'google' }]);
    expect(sessionAuthProvider(value)).toBeNull();
    expect(isLineProviderSession(value)).toBe(false);
  });
});
