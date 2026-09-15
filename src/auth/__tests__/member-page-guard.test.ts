import { describe, expect, it } from 'vitest';
import type { Session } from '@supabase/supabase-js';
import { hasLineSession, hasMemberSession } from '../LinePageGuard';

function session(provider: string): Session {
  return {
    access_token: `${provider}-access-token`,
    user: {
      id: `${provider}-user`,
      app_metadata: { provider, providers: [provider] },
      identities: [{ provider }],
    },
  } as Session;
}

describe('member page session guards', () => {
  it('allows an authenticated Google session into member-only pages', () => {
    const google = session('google');
    expect(hasMemberSession(google)).toBe(true);
    expect(hasLineSession(google)).toBe(false);
  });

  it('continues to allow a LINE session', () => {
    const line = session('custom:line');
    expect(hasMemberSession(line)).toBe(true);
    expect(hasLineSession(line)).toBe(true);
  });

  it('rejects missing sessions', () => {
    expect(hasMemberSession(null)).toBe(false);
    expect(hasLineSession(null)).toBe(false);
  });
});
