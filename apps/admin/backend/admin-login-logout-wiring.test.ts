import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

it('stores the session-linked login record id in the administrator login record', () => {
  const source = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');
  expect(source).toContain("id: login.loginRecordId, admin_id: login.admin.id");
  expect(source).toContain("await credentialAuth.logout(ctx.event?.headers);");
});
