import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const repoRoot = new URL('../', import.meta.url);

function exists(path) {
  return existsSync(new URL(path, repoRoot));
}

test('retired one-shot layout runners and their orphan script stay removed', () => {
  assert.equal(exists('.github/workflows/profile-layout-runner-once.yml'), false);
  assert.equal(exists('.github/workflows/status-layout-runner-once.yml'), false);
  assert.equal(exists('scripts/profile-layout-once.py'), false);
});

test('engineering handoff describes the current production architecture instead of the retired preview-only shape', () => {
  const handoff = readFileSync(new URL('ENGINEER_HANDOFF.md', repoRoot), 'utf8');

  assert.match(handoff, /matrixlottery\.idv\.tw/);
  assert.match(handoff, /PROJECT_HANDOFF\.md/);
  assert.match(handoff, /services\/matrix-api/);
  assert.match(handoff, /Supabase/);
  assert.match(handoff, /Railway/);

  assert.match(handoff, /舊的 `lottery-matrix-preview\.spyuilin688\.chatgpt\.site`/);
  assert.doesNotMatch(handoff, /^線上預覽：/m);
  assert.doesNotMatch(handoff, /功能內頁、API、會員、訂閱、通知與實際開獎資料串接不在此線上預覽原始碼內/);
});


test('dormant root AppDeploy entrypoints and adapters stay removed', () => {
  for (const path of [
    'backend/index.ts',
    'backend/matrix-analysis-store.ts',
    'backend/matrix-result-store.ts',
    'backend/realtime-subscribers.ts',
    'backend/realtime.ts',
    'cron.json',
  ]) {
    assert.equal(exists(path), false, `retired AppDeploy source returned: ${path}`);
  }
});

test('canonical handoff docs do not direct engineers back to a live legacy AppDeploy endpoint', () => {
  const projectHandoff = readFileSync(new URL('PROJECT_HANDOFF.md', repoRoot), 'utf8');
  const railwayReadme = readFileSync(new URL('services/matrix-api/README.md', repoRoot), 'utf8');

  assert.match(projectHandoff, /AppDeploy 帳號清單/);
  assert.match(projectHandoff, /既有樂彩／預覽 apps 均為 `deleted`/);
  assert.doesNotMatch(projectHandoff, /舊 AppDeploy `matrix-sanqwn` 網址仍可連線/);
  assert.doesNotMatch(railwayReadme, /old AppDeploy endpoint remains reachable/);
});
