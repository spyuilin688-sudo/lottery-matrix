import { describe, expect, it } from 'vitest';

import { DEFAULT_WEB_PUSH_PUBLIC_KEY, resolveWebPushPublicKey } from './push-public-key';

describe('web push public key configuration', () => {
  it('uses the configured key when Cloudflare provides one', () => {
    expect(resolveWebPushPublicKey(' configured-key ')).toBe('configured-key');
  });

  it('falls back to the bundled public key when the environment value is missing', () => {
    expect(resolveWebPushPublicKey(undefined)).toBe(DEFAULT_WEB_PUSH_PUBLIC_KEY);
    expect(resolveWebPushPublicKey('   ')).toBe(DEFAULT_WEB_PUSH_PUBLIC_KEY);
  });
});
