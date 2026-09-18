import { readFileSync } from 'node:fs';
import { URL as NodeURL } from 'node:url';
import { expect, test } from 'vitest';

test('routes administrator login records through the ten-row server paginator', () => {
  const source = readFileSync(new NodeURL('./index.ts', import.meta.url), 'utf8');
  expect(source).toContain("ctx.params.table === 'loginRecords'");
  expect(source).toContain('listAdminLoginRecordPage(ctx.query ?? {}, supabase)');
});
