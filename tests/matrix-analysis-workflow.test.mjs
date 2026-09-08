import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const workflow = readFileSync(
  new URL('../.github/workflows/matrix-analysis.yml', import.meta.url),
  'utf8',
);

test('Matrix workflow keeps manual recovery and the existing main push path filters', () => {
  assert.match(workflow, /^on:\n  workflow_dispatch:\n/m);
  assert.match(
    workflow,
    /^  push:\n    branches: \[main\]\n    paths:\n      - \.github\/workflows\/matrix-analysis\.yml\n/m,
  );
  assert.match(workflow, /^    timeout-minutes: 120$/m);
  assert.match(workflow, /^      max-parallel: 1$/m);
  assert.match(workflow, /^      - services\/matrix-api\/\*\*$/m);
  assert.doesNotMatch(workflow, /^  schedule:/m);
});

test('Matrix event gate accepts declared triggers and rejects stale cron events', () => {
  const gate = workflow.match(/      - name: Gate lottery for event\n([\s\S]*?)(?=\n      - name:)/)?.[1];
  const indentedScript = gate?.match(/        run: \|\n([\s\S]*)$/)?.[1];
  assert.ok(indentedScript);
  const script = indentedScript.split('\n')
    .map((line) => line.startsWith('          ') ? line.slice(10) : line).join('\n');

  const directory = mkdtempSync(join(tmpdir(), 'matrix-event-gate-'));
  const output = join(directory, 'output');
  try {
    for (const [eventName, eventSchedule, expected] of [
      ['push', '', 'true'],
      ['workflow_dispatch', '', 'true'],
      ['schedule', '*/15 * * * *', 'false'],
      ['schedule', '50 12 * * 1-6', 'false'],
      ['schedule', '50 13 * * *', 'false'],
      ['pull_request', '', 'false'],
    ]) {
      writeFileSync(output, '');
      const result = spawnSync('bash', ['-c', script], {
        env: {
          ...process.env,
          EVENT_NAME: eventName,
          EVENT_SCHEDULE: eventSchedule,
          LOTTERY_ID: eventSchedule === '50 13 * * *' ? 'marksix' : 'daily539',
          GITHUB_OUTPUT: output,
        },
        encoding: 'utf8',
      });
      assert.equal(result.status, 0, result.stderr);
      assert.equal(readFileSync(output, 'utf8').trim(), `should_run=${expected}`, `${eventName}: ${eventSchedule}`);
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
  assert.doesNotMatch(gate, /EVENT_SCHEDULE|LOTTERY_ID/);
});

test('Matrix workflow runs only Railway-owned lotteries in scheduled worker mode', () => {
  for (const [id, lottery] of [
    ['daily539', '今彩539'],
    ['marksix', '六合彩'],
    ['lotto649', '大樂透'],
  ]) {
    assert.match(workflow, new RegExp(`- id: ${id}\\n\\s+lottery: ${lottery}`));
  }

  assert.doesNotMatch(workflow, /- id: fantasy5\n\s+lottery: 天天樂/);
  assert.match(workflow, /uv run python -m app\.worker --lottery "\$LOTTERY" --scheduled/);
  assert.doesNotMatch(workflow, /app\.worker[^\n]*--immediate/);
});

test('Matrix workflow cancels and drains older runs before bounded analysis starts', () => {
  const releaseStale = workflow.match(/^  release-stale:\n[\s\S]*?(?=^  analyze:)/m)?.[0];
  const analyze = workflow.match(/^  analyze:\n[\s\S]*$/m)?.[0];
  assert.ok(releaseStale);
  assert.ok(analyze);

  assert.match(releaseStale, /^    runs-on: ubuntu-latest$/m);
  assert.match(releaseStale, /^      actions: write$/m);
  assert.match(releaseStale, /^      CURRENT_RUN_ID: \$\{\{ github\.run_id \}\}$/m);
  assert.match(releaseStale, /^      CURRENT_RUN_NUMBER: \$\{\{ github\.run_number \}\}$/m);
  assert.match(releaseStale, /gh api --paginate --slurp/);
  assert.match(releaseStale, /actions\/workflows\/matrix-analysis\.yml\/runs\?per_page=100/);
  assert.match(releaseStale, /select\(\.run_number < \$current and \.status != "completed"\)/);
  assert.match(releaseStale, /actions\/runs\/\$stale_run_id\/cancel/);
  assert.match(releaseStale, /while \(\( SECONDS < deadline \)\); do/);
  assert.match(releaseStale, /if \[\[ "\$status" != "completed" \]\]; then/);
  assert.match(releaseStale, /NEWER_MATRIX_RUN_EXISTS/);
  assert.match(releaseStale, /STALE_MATRIX_RUNS_DID_NOT_STOP/);

  assert.match(analyze, /^    needs: release-stale$/m);
  assert.match(analyze, /^      group: matrix-scheduled-analysis-\$\{\{ matrix\.id \}\}$/m);
  assert.match(analyze, /^      cancel-in-progress: true$/m);
});

test('Matrix stale-run barrier fails closed when run selection cannot be parsed', () => {
  const releaseStale = workflow.match(/^  release-stale:\n[\s\S]*?(?=^  analyze:)/m)?.[0];
  const indentedScript = releaseStale?.match(/        run: \|\n([\s\S]*)$/)?.[1];
  assert.ok(indentedScript);
  const script = indentedScript
    .split('\n')
    .map((line) => line.startsWith('          ') ? line.slice(10) : line)
    .join('\n');

  const result = spawnSync('bash', ['-c', `
    gh() { printf '[{"workflow_runs":[]}]'; }
    jq() { return 7; }
    ${script}
  `], {
    env: {
      ...process.env,
      CURRENT_RUN_ID: '200',
      CURRENT_RUN_NUMBER: '20',
      REPOSITORY: 'owner/repository',
    },
    encoding: 'utf8',
  });

  assert.notEqual(result.status, 0, result.stdout + result.stderr);
});

test('Matrix stale-run barrier rejects an old attempt when a newer run exists', () => {
  const releaseStale = workflow.match(/^  release-stale:\n[\s\S]*?(?=^  analyze:)/m)?.[0];
  const indentedScript = releaseStale?.match(/        run: \|\n([\s\S]*)$/)?.[1];
  assert.ok(indentedScript);
  const script = indentedScript
    .split('\n')
    .map((line) => line.startsWith('          ') ? line.slice(10) : line)
    .join('\n');

  const result = spawnSync('bash', ['-c', `
    gh() {
      printf '[{"workflow_runs":[{"id":300,"run_number":21,"status":"completed"}]}]'
    }
    ${script}
  `], {
    env: {
      ...process.env,
      CURRENT_RUN_ID: '200',
      CURRENT_RUN_NUMBER: '20',
      REPOSITORY: 'owner/repository',
    },
    encoding: 'utf8',
  });

  assert.notEqual(result.status, 0, result.stdout + result.stderr);
});
