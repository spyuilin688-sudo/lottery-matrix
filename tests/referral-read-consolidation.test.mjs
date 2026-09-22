import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration = fs.readFileSync(
  new URL('../supabase/migrations/20260922123600_consolidate_referral_member_reads.sql', import.meta.url),
  'utf8',
);

function body(signature, nextSignature) {
  const start = migration.indexOf(`create or replace function ${signature}`);
  assert.notEqual(start, -1, `${signature} must exist`);
  const end = nextSignature
    ? migration.indexOf(`create or replace function ${nextSignature}`, start + 1)
    : migration.length;
  return migration.slice(start, end === -1 ? migration.length : end);
}

test('referral summary locks the member once and reuses the locked snapshot', () => {
  const summary = body(
    'public.member_referral_summary()',
    'public.member_referral_submit(p_referral_code text)',
  );
  assert.doesNotMatch(summary, /active_member_id\(/);
  assert.match(summary, /where member\.auth_user_id = v_uid[\s\S]*for update;/);
  assert.match(summary, /member_referral_summary_for_locked_member\(v_member\)/);
  assert.equal((summary.match(/from public\.members as member/g) ?? []).length, 1);
});

test('referral-code generation reuses the caller-owned row lock', () => {
  const helper = body(
    'private.ensure_member_referral_code_locked(p_member public.members)',
    'private.member_referral_summary_for_locked_member(p_member public.members)',
  );
  assert.doesNotMatch(helper, /for update/);
  assert.doesNotMatch(helper, /select[\s\S]*from public\.members/);
  assert.match(helper, /where id = p_member\.id/);
});

test('referral submit preserves deterministic dual-row locking without post-lock rereads', () => {
  const submit = body('public.member_referral_submit(p_referral_code text)');
  assert.match(submit, /order by member\.id\s+for update/);
  assert.doesNotMatch(submit, /active_member_id\(|public\.member_referral_summary\(\)/);
  assert.match(submit, /v_member := v_locked;/);
  assert.match(submit, /v_target_member := v_locked;/);
  assert.match(submit, /member_referral_summary_for_locked_member\(v_member\)/);
  assert.equal((submit.match(/select member\.\*/g) ?? []).length, 1);
});
