import { describe, expect, it } from 'vitest';

import { resolveRailwayApiBase } from './runtime-api-config';

describe('Railway API runtime configuration', () => {
  it('uses the production Railway API when Cloudflare does not inject an override', () => {
    expect(resolveRailwayApiBase(undefined)).toBe(
      'https://heartfelt-generosity-production-9f2b.up.railway.app',
    );
  });

  it('uses the production Railway API when Cloudflare injects an empty value', () => {
    expect(resolveRailwayApiBase('   ')).toBe(
      'https://heartfelt-generosity-production-9f2b.up.railway.app',
    );
  });

  it('prefers and normalizes a Cloudflare environment override', () => {
    expect(resolveRailwayApiBase(' https://api.example.com/// ')).toBe(
      'https://api.example.com',
    );
  });
});
