import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const workflow = readFileSync(
  new URL('../.github/workflows/matrix-analysis.yml', import.meta.url),
  'utf8',
);

test('Matrix workflow triggers its one-shot recovery only when this workflow changes on main', () => {
  assert.match(workflow, /^on:\n  workflow_dispatch:\n/m);
  assert.match(
    workflow,
    /^  push:\n    branches: \[main\]\n    paths:\n      - \.github\/workflows\/matrix-analysis\.yml\n/m,
  );
  assert.match(workflow, /^    timeout-minutes: 120$/m);
  assert.match(workflow, /^      max-parallel: 2$/m);
});

test('Matrix workflow runs every lottery for a push without scheduling the worker', () => {
  assert.match(
    workflow,
    /if \[\[ "\$EVENT_NAME" == "push" \|\| "\$EVENT_NAME" == "workflow_dispatch" \|\| "\$EVENT_SCHEDULE" == "\*\/15 \* \* \* \*" \]\]; then\n            should_run=true/,
  );

  for (const [id, lottery] of [
    ['daily539', '今彩539'],
    ['fantasy5', '天天樂'],
    ['marksix', '六合彩'],
    ['lotto649', '大樂透'],
  ]) {
    assert.match(workflow, new RegExp(`- id: ${id}\\n\\s+lottery: ${lottery}`));
  }

  assert.match(workflow, /uv run python -m app\.worker --lottery "\$LOTTERY"/);
  assert.doesNotMatch(workflow, /app\.worker[^\n]*--scheduled/);
});

test('Matrix workflow releases every stale lottery slot before bounded analysis starts', () => {
  const releaseStale = workflow.match(/^  release-stale:\n[\s\S]*?(?=^  analyze:)/m)?.[0];
  const analyze = workflow.match(/^  analyze:\n[\s\S]*$/m)?.[0];
  assert.ok(releaseStale);
  assert.ok(analyze);

  assert.match(releaseStale, /^    runs-on: ubuntu-latest$/m);
  assert.match(releaseStale, /^      max-parallel: 4$/m);
  assert.match(releaseStale, /^        id: \[daily539, fantasy5, marksix, lotto649\]$/m);
  assert.match(releaseStale, /^      group: matrix-scheduled-analysis-\$\{\{ matrix\.id \}\}$/m);
  assert.match(releaseStale, /^      cancel-in-progress: true$/m);

  assert.match(analyze, /^    needs: release-stale$/m);
  assert.match(analyze, /^      group: matrix-scheduled-analysis-\$\{\{ matrix\.id \}\}$/m);
  assert.match(analyze, /^      cancel-in-progress: true$/m);
});
