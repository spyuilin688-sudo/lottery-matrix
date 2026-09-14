import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { commandFor, changedPaths, selectTests } from '../scripts/select-scoped-tests.mjs';

const files = new Map(Object.entries({
  'docs/readme.md': 'Documentation',
  'apps/admin/backend/admin-data.ts': 'export const count = 1;',
  'apps/admin/backend/admin-data.test.ts': "import { count } from './admin-data'; import { it } from 'vitest';",
  'apps/admin/src/admin-platform-client.ts': 'export const api = {};',
  'apps/admin/src/admin-platform-client.test.ts': "import { api } from './admin-platform-client'; import { it } from 'vitest';",
  'apps/admin/src/admin.css': '@import "./status.css";',
  'apps/admin/src/status.css': '.status { display: grid; }',
  'apps/admin/src/admin-button-styles.test.ts': "import { it } from 'vitest'; readFileSync(new URL('./admin.css', import.meta.url));",
  'src/client.ts': "export { transport } from './transport';",
  'src/transport.ts': 'export const transport = {};',
  'src/client.test.ts': "import { api } from './client'; import { it } from 'vitest';",
  'tests/client-source.test.mjs': "import test from 'node:test'; readFileSync(new URL('../src/client.ts', import.meta.url));",
  'tests/fixtures/legacy.js': 'old worker',
  'tests/worker.test.mjs': "import test from 'node:test'; readFileSync(new URL('./fixtures/legacy.js', import.meta.url));",
  'supabase/functions/example/handler.ts': 'export const handler = 1;',
  'supabase/functions/example/handler.test.ts': "import { handler } from './handler.ts'; import { it } from 'vitest';",
  'services/matrix-api/app/schedule.py': 'from .dates import today',
  'services/matrix-api/app/dates.py': 'today = 1',
  'services/matrix-api/tests/test_schedule.py': 'from app import schedule\n',
  'services/matrix-api/tests/test_other.py': 'def test_other(): pass',
  'tests/mobile-runtime.spec.ts': "import { test } from '@playwright/test';",
  'tests/membership-preview/responsive.spec.ts': "import { test } from '@playwright/test';",
}));

test('empty and documentation-only changes select no runners', () => {
  for (const changed of [[], ['docs/readme.md'], ['docs/qa/new.md']]) {
    const plan = selectTests(files, changed);
    assert.ok(Object.values(plan.groups).every(group => group.length === 0));
    for (const group of Object.keys(plan.groups)) assert.equal(commandFor(group, [], '/repo'), null);
  }
});

test('backend, admin client, and CSS changes stay in related explicit files', () => {
  const backend = selectTests(files, ['apps/admin/backend/admin-data.ts']);
  assert.deepEqual(backend.groups.vitest, ['apps/admin/backend/admin-data.test.ts']);
  assert.deepEqual(backend.groups.admin, []);
  assert.deepEqual(backend.groups.python, []);
  assert.deepEqual(selectTests(files, ['apps/admin/src/admin-platform-client.ts']).groups.admin,
    ['apps/admin/src/admin-platform-client.test.ts']);
  assert.deepEqual(selectTests(files, ['apps/admin/src/status.css']).groups.admin,
    ['apps/admin/src/admin-button-styles.test.ts']);
});

test('imports are transitive, source text reads do not execute the inspected module', () => {
  const plan = selectTests(files, ['src/transport.ts']);
  assert.deepEqual(plan.groups.vitest, ['src/client.test.ts']);
  assert.deepEqual(plan.groups.node, []);
  assert.deepEqual(selectTests(files, ['src/client.ts']).groups.node, ['tests/client-source.test.mjs']);
});

test('deleted fixtures and modules still select their surviving consumers', () => {
  const remaining = new Map(files);
  remaining.delete('tests/fixtures/legacy.js');
  remaining.delete('src/transport.ts');
  assert.deepEqual(selectTests(remaining, ['src/transport.ts']).groups.vitest, ['src/client.test.ts']);
  remaining.delete('src/client.test.ts');
  const plan = selectTests(remaining, ['tests/fixtures/legacy.js', 'src/transport.ts', 'src/client.test.ts']);
  assert.deepEqual(plan.groups.node, ['tests/worker.test.mjs']);
  assert.deepEqual(plan.groups.vitest, []);
});

test('multiline URL fixture reads and deterministic ordering survive formatting and input order', () => {
  const formatted = new Map(files);
  formatted.set('tests/migration.test.mjs', `import test from 'node:test';
    const sql = readFileSync(new URL(
      '../supabase/migrations/change.sql',
      import.meta.url,
    ), 'utf8');`);
  const changed = ['supabase/migrations/change.sql', 'src/client.ts', 'src/transport.ts'];
  const result = selectTests(formatted, changed);
  assert.ok(result.groups.node.includes('tests/migration.test.mjs'));
  assert.equal(JSON.stringify(result), JSON.stringify(selectTests(new Map([...formatted].reverse()), [...changed].reverse())));
});

test('source reader helpers resolve their declared URL base, not a same-named root file', () => {
  const fixtures = new Map([
    ['index.html', '<html>Member app</html>'], ['apps/admin/index.html', '<html>Admin</html>'],
    ['tests/admin.test.mjs', `import test from 'node:test';
      const read = name => readFileSync(new URL('../apps/admin/' + name, import.meta.url), 'utf8');
      const html = read('index.html');`],
  ]);
  assert.deepEqual(selectTests(fixtures, ['apps/admin/index.html']).groups.node, ['tests/admin.test.mjs']);
  assert.deepEqual(selectTests(fixtures, ['index.html']).groups.node, []);
});

test('Python relative imports and from-package imports select the dependent file only', () => {
  assert.deepEqual(selectTests(files, ['services/matrix-api/app/dates.py']).groups.python,
    ['services/matrix-api/tests/test_schedule.py']);
});

test('edge and directly changed browser tests use their own configurations', () => {
  const plan = selectTests(files, ['supabase/functions/example/handler.ts',
    'tests/mobile-runtime.spec.ts', 'tests/membership-preview/responsive.spec.ts']);
  assert.deepEqual(plan.groups.edge, ['supabase/functions/example/handler.test.ts']);
  assert.deepEqual(plan.groups.playwright, ['tests/mobile-runtime.spec.ts']);
  assert.deepEqual(plan.groups.membership, ['tests/membership-preview/responsive.spec.ts']);
});

test('every runner receives explicit absolute test paths; empty or unsafe scope never invokes it', () => {
  const examples = {
    node: 'tests/worker.test.mjs', vitest: 'src/client.test.ts',
    edge: 'supabase/functions/example/handler.test.ts', admin: 'apps/admin/src/admin-platform-client.test.ts',
    python: 'services/matrix-api/tests/test_schedule.py', playwright: 'tests/mobile-runtime.spec.ts',
    membership: 'tests/membership-preview/responsive.spec.ts',
  };
  for (const [group, file] of Object.entries(examples)) {
    const command = commandFor(group, [file], '/repo');
    assert.equal(command.args.at(-1), `/repo/${file}`);
    assert.ok(command.args.every(arg => !arg.includes('*')));
    assert.equal(commandFor(group, [], '/repo'), null);
  }
  assert.deepEqual(commandFor('node', [examples.node], '/repo').args.slice(0, -1), ['--test']);
  assert.ok(commandFor('edge', [examples.edge], '/repo').args.includes('vitest.edge-functions.config.ts'));
  assert.ok(commandFor('admin', [examples.admin], '/repo').args.includes('apps/admin/vite.config.ts'));
  assert.ok(commandFor('membership', [examples.membership], '/repo').args.includes('playwright.membership-preview.config.ts'));
  assert.deepEqual(commandFor('python', [examples.python], '/repo').args.slice(0, -1), ['run', 'pytest', '-q']);
  for (const file of ['tests/*.test.mjs', '../outside.test.mjs', '--help', 'src/client.ts']) {
    assert.throws(() => commandFor('node', [file], '/repo'), /explicit test file/);
  }
});

test('Git scopes PR changes from merge base and push changes from exact before/after; retains deletes', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'scoped-ci-'));
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
  const commit = (file, text) => {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), text);
    git('add', file); git('commit', '-qm', file);
    return git('rev-parse', 'HEAD');
  };
  try {
    git('init', '-q'); git('config', 'user.email', 'scoped-ci@example.invalid'); git('config', 'user.name', 'Scoped CI fixture');
    const base = commit('shared.txt', 'base');
    git('checkout', '-qb', 'feature');
    const head = commit('feature.txt', 'feature');
    git('checkout', '-qb', 'advanced-main', base);
    const advancedBase = commit('main-only.txt', 'main');
    assert.deepEqual(changedPaths(root, advancedBase, head, 'pull_request'), ['feature.txt']);
    assert.deepEqual(changedPaths(root, advancedBase, head, 'push'), ['feature.txt', 'main-only.txt']);
    git('checkout', '-q', 'feature'); git('rm', '-q', 'shared.txt'); git('commit', '-qm', 'delete');
    assert.deepEqual(changedPaths(root, head, git('rev-parse', 'HEAD'), 'push'), ['shared.txt']);
    assert.throws(() => changedPaths(root, '0'.repeat(40), head, 'push'), /base and head/);
    assert.throws(() => changedPaths(root, '', head, 'pull_request'), /base and head/);
    assert.throws(() => changedPaths(root, 'f'.repeat(40), head, 'push'), /unavailable/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
