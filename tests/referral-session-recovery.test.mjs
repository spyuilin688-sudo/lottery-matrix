import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const featurePages = readFileSync(new URL('../src/FeaturePages.tsx', import.meta.url), 'utf8');

function activationCodePageSource() {
  const start = featurePages.indexOf('function ActivationCodePage');
  const end = featurePages.indexOf('function InviteFriendsPage', start);
  assert.notEqual(start, -1, 'ActivationCodePage source must exist');
  assert.notEqual(end, -1, 'ActivationCodePage source boundary must exist');
  return featurePages.slice(start, end);
}

test('referral load surfaces an expired member session through the existing LINE login-required state', () => {
  const page = activationCodePageSource();
  assert.match(featurePages, /MEMBER_SESSION_EXPIRED[\s\S]*LINE_IDENTITY_REQUIRED/);
  assert.match(page, /fetchMemberReferralSummary\(\)[\s\S]*?\.catch\(\(error\)\s*=>\s*\{[\s\S]*?setReferralResultState\(referralErrorCode\(error\)\)/);
});
