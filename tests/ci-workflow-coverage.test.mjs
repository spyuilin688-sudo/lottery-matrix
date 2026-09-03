import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workflow = readFileSync('.github/workflows/ci.yml', 'utf8');

function job(name) {
  const match = workflow.match(new RegExp('\\n  ' + name + ':\\n[\\s\\S]*?(?=\\n  [a-z][a-z0-9-]*:\\n|$)'));
  assert.ok(match, 'Project CI is missing the ' + name + ' job');
  return match[0];
}

test('Project CI runs the complete root Vitest suite', () => {
  assert.match(workflow, /run:\s+npm run test:unit(?:\s|$)/);
});

test('Project CI runs Playwright with its Chromium system dependencies', () => {
  const runtime = job('runtime-tests');
  assert.match(runtime, /playwright install --with-deps chromium/);
  assert.match(runtime, /run:\s+npm run test:runtime(?:\s|$)/);
});

test('Project CI runs the admin test and build scripts', () => {
  const admin = job('admin');
  assert.match(admin, /working-directory:\s+apps\/admin/);
  assert.match(admin, /run:\s+npm ci(?:\s|$)/);
  assert.match(admin, /run:\s+npm test(?:\s|$)/);
  assert.match(admin, /run:\s+APPDEPLOY_CI_EXTERNALS=true npm run build(?:\s|$)/);
});
