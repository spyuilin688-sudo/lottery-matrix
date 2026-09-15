import { describe, expect, it } from 'vitest';
import type { Session } from '@supabase/supabase-js';
import { hasLineSession, hasMemberSession } from '../LinePageGuard';

function session(provider: string): Session {
  return {
    access_token: `${provider}-access-token`,
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    refresh_token: `${provider}-refresh-token`,
    user: {
      id: `${provider}-user`,
      aud: 'authenticated',
      role: 'authenticated',
      email: provider === 'google' ? 'member@example.com' : undefined,
      app_metadata: { provider, providers: [provider] },
      user_metadata: {},
      identities: [{
        identity_id: `${provider}-identity`,
        id: `${provider}-identity`,
        user_id: `${provider}-user`,
        identity_data: {},
        provider,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        last_sign_in_at: new Date().toISOString(),
      }],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  };
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
