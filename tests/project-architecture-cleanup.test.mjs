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
