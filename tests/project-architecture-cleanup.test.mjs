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


test('dormant backend entrypoints, adapters, and cron ownership stay removed', () => {
  for (const path of [
    'backend/index.ts',
    'backend/matrix-analysis-store.ts',
    'backend/matrix-result-store.ts',
    'backend/realtime-subscribers.ts',
    'backend/realtime.ts',
    'apps/admin/backend/realtime-subscribers.ts',
    'apps/admin/backend/realtime.ts',
    'backend/member-online.ts',
    'backend/member-profile-store.ts',
    'backend/member-profile-routes.ts',
    'backend/member-notification-store.ts',
    'backend/member-notification-routes.ts',
    'backend/member-bootstrap.ts',
    'backend/member-bootstrap-routes.ts',
    'backend/member-route-handlers.ts',
    'cron.json',
    'apps/admin/cron.json',
  ]) {
    assert.equal(exists(path), false, `retired backend source returned: ${path}`);
  }
});

test('canonical handoff docs identify the current hosting and API owners', () => {
  const agentInstructions = readFileSync(new URL('AGENTS.md', repoRoot), 'utf8');
  const projectHandoff = readFileSync(new URL('PROJECT_HANDOFF.md', repoRoot), 'utf8');
  const railwayReadme = readFileSync(new URL('services/matrix-api/README.md', repoRoot), 'utf8');

  assert.match(agentInstructions, /管理後台 API 的正式執行入口是 Supabase `admin-api` Edge Function/);
  assert.match(projectHandoff, /Cloudflare Pages，https:\/\/matrixlottery\.idv\.tw\/admin\//);
  assert.match(projectHandoff, /Supabase `admin-api` Edge Function/);
  assert.match(railwayReadme, /the admin API is the Supabase `admin-api` Edge Function/);
});


test('active shared backend owners remain after retired code cleanup', () => {
  for (const path of [
    'backend/matrix-member-auth.ts',
    'backend/matrix-status-routes.ts',
    'backend/matrix-status-service.ts',
    'backend/member-notification-settings.ts',
    'backend/matrix-explore-service.ts',
  ]) {
    assert.equal(exists(path), true, `active shared backend owner missing: ${path}`);
  }
});
