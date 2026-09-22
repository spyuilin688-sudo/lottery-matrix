import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration = fs.readFileSync(
  new URL('../supabase/migrations/20260922034033_consolidate_member_read_paths.sql', import.meta.url),
  'utf8',
);
const memberApi = fs.readFileSync(new URL('../src/member-api.ts', import.meta.url), 'utf8');

test('member profile reuses one member snapshot for profile and Matrix entitlements', () => {
  const profile = migration.slice(
    migration.indexOf('create or replace function public.member_profile()'),
    migration.indexOf('create or replace function public.member_notification_settings_get()'),
  );
  assert.match(profile, /select \*\s+into v_member\s+from public\.members/s);
  assert.match(profile, /matrix_result_entitlements_for_member\(v_uid, v_member, v_plan_name\)/);
  assert.doesNotMatch(profile, /active_member_id\(|member_profile_20260829_impl\(|matrix_result_entitlements\(\)/);
});

test('notification and online wrappers use the already validated active member id directly', () => {
  for (const signature of [
    'public.member_notification_settings_get()',
    'public.member_notification_settings_save(p_settings jsonb)',
    'public.member_online_start()',
    'public.member_online_end(p_session_id uuid)',
  ]) {
    const start = migration.indexOf(`create or replace function ${signature}`);
    assert.notEqual(start, -1, `${signature} must be present`);
    const next = migration.indexOf('create or replace function ', start + 1);
    const body = migration.slice(start, next === -1 ? migration.length : next);
    assert.match(body, /private\.active_member_id\(\)/);
    assert.doesNotMatch(body, /_20260829_impl\(/);
  }
});

test('member bootstrap is shared per authenticated session generation', () => {
  assert.match(memberApi, /let bootstrapScope: number \| null = null;/);
  assert.match(memberApi, /if \(bootstrapResult\) return Promise\.resolve\(bootstrapResult\);/);
  assert.match(memberApi, /if \(bootstrapInFlight\) return bootstrapInFlight;/);
  assert.match(memberApi, /bootstrapScope === scope && getAlgorithmCacheScope\(\) === scope/);
});
