import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workflow = readFileSync('.github/workflows/ci.yml', 'utf8');
const notebookWorkflow = readFileSync('.github/workflows/notebook-ui-check.yml', 'utf8');
const tiangongWorkflow = readFileSync('.github/workflows/tiangong-sorted-refresh.yml', 'utf8');
const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));

function job(name) {
  const match = workflow.match(new RegExp('\\n  ' + name + ':\\n[\\s\\S]*?(?=\\n  [a-z][a-z0-9-]*:\\n|$)'));
  assert.ok(match, 'Project CI is missing the ' + name + ' job');
  return match[0];
}

test('CI selects a real PR or push diff and checks out the tested head', () => {
  const scope = job('scope');
  assert.match(scope, /fetch-depth: 0/);
  assert.match(scope, /ref: \$\{\{ env\.SCOPE_HEAD_SHA \}\}/);
  assert.match(workflow, /github\.event\.pull_request\.base\.sha \|\| github\.event\.before/);
  assert.match(workflow, /github\.event\.pull_request\.head\.sha \|\| github\.sha/);
  assert.match(scope, /--base "\$SCOPE_BASE_SHA" --head "\$SCOPE_HEAD_SHA" --event "\$GITHUB_EVENT_NAME"/);
  assert.match(scope, /--github-output "\$GITHUB_OUTPUT"/);
});

test('CI has no whole-project test command or wildcard test invocation', () => {
  const commands = [...workflow.matchAll(/^\s*run:\s*(.+)$/gm)].map(match => match[1]);
  assert.ok(commands.length > 0);
  for (const command of commands) {
    assert.doesNotMatch(command, /npm (?:test\b|run test:(?:unit|edge-functions|runtime)\b)/);
    assert.doesNotMatch(command, /(?:node --test|vitest run|uv run pytest|playwright test)/,
      'Test runners must receive validated explicit files through the selector');
  }
  for (const group of ['node', 'vitest', 'edge', 'admin', 'python', 'playwright', 'membership']) {
    assert.equal(commands.filter(command => command === `node scripts/select-scoped-tests.mjs --plan-env SCOPED_TEST_PLAN --run ${group}`).length, 1);
    assert.match(workflow, new RegExp(`if: needs\\.scope\\.outputs\\.${group} == 'true'`));
  }
});

test('runtime commit atomicity, protected file integrity, and production build remain required once', () => {
  const runtime = job('runtime-integrity');
  assert.match(runtime, /needs: scope/);
  assert.doesNotMatch(runtime, /\n    if:/);
  assert.match(runtime, /fetch-depth: 0/);
  assert.match(runtime, /run: node scripts\/check-runtime-commit-integrity\.mjs "\$SCOPE_BASE_SHA" "\$SCOPE_HEAD_SHA"/);
  assert.equal(packageJson.scripts?.prebuild, 'npm run check:runtime');
  assert.match(runtime, /run: npm run build/);
  assert.equal([...workflow.matchAll(/^\s*run:\s*npm run build\s*$/gm)].length, 1);
  assert.doesNotMatch(runtime, /^\s*run:\s*npm run check:runtime\s*$/m);
});

test('the single production build runs before selected packaging tests', () => {
  const runtime = job('runtime-integrity');
  const buildIndex = runtime.indexOf('run: npm run build');
  const nodeIndex = runtime.indexOf('--run node');
  assert.ok(buildIndex >= 0);
  assert.ok(nodeIndex > buildIndex, 'Packaging tests need the production artifact');
  const related = job('test-and-build');
  assert.doesNotMatch(related, /--run node/);
  assert.doesNotMatch(related, /^\s*run:\s*npm run build\s*$/m);
});

test('browser jobs install Chromium dependencies and run each configuration only with selected files', () => {
  const runtime = job('runtime-tests');
  assert.match(runtime, /playwright install --with-deps chromium/);
  assert.match(runtime, /PLAYWRIGHT_BROWSERS_PATH: \.sites-runtime\/playwright/);
  assert.match(runtime, /--run playwright/);
  assert.match(runtime, /--run membership/);
  assert.match(runtime, /if: needs\.scope\.outputs\.playwright == 'true' \|\| needs\.scope\.outputs\.membership == 'true'/);
});

test('admin build modes are not repeated and Python uses the selected plan', () => {
  const admin = job('admin');
  assert.doesNotMatch(admin, /\n    if:/);
  assert.match(admin, /working-directory: apps\/admin/);
  assert.match(admin, /run: APPDEPLOY_CI_EXTERNALS=true npm run build/);
  assert.doesNotMatch(admin, /run: npm run build:pages/);
  assert.match(packageJson.scripts?.build ?? '', /npm run build:admin:pages/);
  assert.match(admin, /--run admin/);
  const python = job('matrix-api');
  assert.match(python, /working-directory: services\/matrix-api/);
  assert.match(python, /run: uv sync --frozen/);
  assert.match(python, /--run python/);
});

test('specialized Notebook and Tiangong workflows do not duplicate Project CI PR or main checks', () => {
  assert.doesNotMatch(notebookWorkflow, /^\s*pull_request:/m);
  assert.match(notebookWorkflow, /^\s*push:/m);
  assert.match(tiangongWorkflow, /^\s*workflow_dispatch:/m);
  assert.doesNotMatch(tiangongWorkflow, /^\s*(?:push|pull_request):/m);
});

test('selected test jobs fail the workflow when their tests fail', () => {
  const root = job('test-and-build');
  const runtime = job('runtime-tests');
  assert.doesNotMatch(root, /continue-on-error:\s*true/);
  assert.doesNotMatch(runtime, /continue-on-error:\s*true/);
});

test('main pushes finish one same-commit release gate without cancellation', () => {
  assert.match(
    workflow,
    /cancel-in-progress:\s*\$\{\{ github\.event_name == 'pull_request' \}\}/,
  );

  const gate = job('release-gate');
  assert.match(
    gate,
    /needs:\s*\[scope, runtime-integrity, test-and-build, runtime-tests, admin, matrix-api\]/,
  );
  assert.match(gate, /if:\s*always\(\)/);
  assert.match(gate, /scope:\s*\$\{\{ needs\.scope\.result \}\}/);
  assert.match(gate, /runtime_integrity:\s*\$\{\{ needs\.runtime-integrity\.result \}\}/);
  assert.match(gate, /test_and_build:\s*\$\{\{ needs\.test-and-build\.result \}\}/);
  assert.match(gate, /runtime_tests:\s*\$\{\{ needs\.runtime-tests\.result \}\}/);
  assert.match(gate, /admin:\s*\$\{\{ needs\.admin\.result \}\}/);
  assert.match(gate, /matrix_api:\s*\$\{\{ needs\.matrix-api\.result \}\}/);
  assert.match(gate, /Required CI job did not succeed/);
  assert.match(gate, /Conditional CI job neither succeeded nor skipped/);
});
