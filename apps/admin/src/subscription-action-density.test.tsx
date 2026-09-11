import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { URL as NodeURL } from 'node:url';

const adminApp = readFileSync(new NodeURL('./AdminApp.tsx', import.meta.url), 'utf8');
const css = readFileSync(new NodeURL('./admin-operations.css', import.meta.url), 'utf8');

describe('subscription management action density', () => {
  it('uses the compact subscription action variant for both table actions', () => {
    expect(adminApp).toContain('className="compactButton subscriptionTableAction" onClick={() => open(row, "adjustExpiry")}');
    expect(adminApp).toContain('className="compactButton subscriptionTableAction" onClick={() => setUserInfo(row)}');
    expect(css).toMatch(/\.tableWrap \.compactButton\.subscriptionTableAction\s*\{[^}]*height:\s*24px;[^}]*padding:\s*0 6px;[^}]*font-size:\s*11px;/);
  });
});
