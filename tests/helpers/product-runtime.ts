import type { Page } from '@playwright/test';

/** Layout/interaction scenarios start after the separately tested first-visit guide. */
export async function prepareReturningVisitor(page: Page) {
  await page.addInitScript(() => localStorage.setItem('matrix-first-visit-guide-seen', '1'));
}

/** Synthetic LINE identity stays inside this browser; all provider requests are intercepted. */
export async function prepareLineMember(page: Page, now = new Date()) {
  const expiresAt = Math.floor(now.getTime() / 1000) + 3600;
  const user = {
    id: '00000000-0000-4000-8000-000000000001', aud: 'authenticated', role: 'authenticated',
    app_metadata: { provider: 'custom:line', providers: ['custom:line'] },
    user_metadata: { name: 'Runtime member' },
    identities: [{ id: 'runtime-line', provider: 'custom:line', identity_data: { sub: 'runtime-line' } }],
    created_at: '2026-09-01T00:00:00Z',
  };
  await page.route('https://*.supabase.co/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/auth/v1/user') return route.fulfill({ json: user });
    if (path === '/rest/v1/rpc/matrix_custom_status_list') {
      return route.fulfill({ json: { items: [], entitlements: { canCustomizeStatus: true, canUseCompositeCustomRoad: false } } });
    }
    if (['member_bootstrap', 'member_online_start', 'member_online_end'].some(name => path === `/rest/v1/rpc/${name}`)) {
      return route.fulfill({ json: {} });
    }
    // Never send a synthetic authenticated request to a real backend.
    return route.fulfill({ status: 503, json: { error: 'runtime_fixture_unavailable' } });
  });
  await page.addInitScript(({ user, expiresAt }) => {
    localStorage.setItem('sb-wcimzbbapfrdotjsfyxa-auth-token', JSON.stringify({
      access_token: 'runtime-test-access-token', refresh_token: 'runtime-test-refresh-token',
      token_type: 'bearer', expires_in: 3600, expires_at: expiresAt, user,
    }));
  }, { user, expiresAt });
}
