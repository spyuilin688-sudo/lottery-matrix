import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('routes the public draw API to Railway', async () => {
  const [source, config] = await Promise.all([
    read('src/lottery-api.ts'),
    read('src/runtime-api-config.ts'),
  ]);
  assert.match(source, /RAILWAY_API_BASE/);
  assert.match(config, /VITE_RAILWAY_API_BASE/);
  assert.match(config, /heartfelt-generosity-production-9f2b\.up\.railway\.app/);
  assert.match(source, /\/api\/matrix\/(?:latest|history|tongxing|number-reference)/);
});

test('routes member, LINE and completed Matrix results to Supabase', async () => {
  const [member, line, matrix, status, online] = await Promise.all([
    read('src/member-api.ts'),
    read('src/auth/line-auth.ts'),
    read('src/matrix-algorithm-api.ts'),
    read('src/matrix-status-api.ts'),
    read('src/member-online-api.ts'),
  ]);
  assert.match(member, /\.rpc\(name/);
  assert.match(line, /functions\.invoke\('line-logout'/);
  assert.match(matrix, /matrix_tianyan_list/);
  assert.match(matrix, /matrix_tiangong_list/);
  assert.match(status, /functions\.invoke\('matrix-status'/);
  assert.match(status, /matrix_custom_status_list/);
  assert.match(online, /member_online_start/);
});

test('does not ship the legacy non-admin AppDeploy app in the PWA runtime', async () => {
  const runtimeFiles = [
    'src/lottery-api.ts',
    'src/matrix-api-client.ts',
    'src/member-api.ts',
    'src/auth/line-auth.ts',
    'src/matrix-algorithm-api.ts',
    'src/matrix-status-api.ts',
    'src/main.tsx',
  ];
  const runtime = (await Promise.all(runtimeFiles.map(read))).join('\n');
  assert.doesNotMatch(runtime, /app-snsxet|api-v2\.appdeploy\.ai/);
});
