import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { lineNicknameFromSession } from './MemberPages';

test('profile resolves the LINE nickname from the signed-in session', () => {
  expect(lineNicknameFromSession({
    user: {
      user_metadata: { name: 'LINE 暱稱' },
      identities: [{ provider: 'custom:line', identity_data: { name: 'LINE identity' } }],
    },
  })).toBe('LINE 暱稱');
});

test('profile resolves the Google nickname from full_name metadata', () => {
  expect(lineNicknameFromSession({
    user: {
      user_metadata: { full_name: 'Google 暱稱' },
      identities: [{ provider: 'google', identity_data: { full_name: 'Google identity' } }],
    },
  })).toBe('Google 暱稱');
});

test('profile nickname UI uses the resolved nickname instead of provider ID', () => {
  const source = readFileSync(new URL('./MemberPages.tsx', import.meta.url), 'utf8');
  const nicknameStart = source.indexOf('className="profile-nickname"');
  const nicknameBlock = source.slice(nicknameStart, nicknameStart + 520);

  expect(nicknameBlock).toContain('memberNickname');
  expect(nicknameBlock).not.toContain('visibleProviderIdentity');
});

test('current subscription status stays visible when purchase entries are hidden', () => {
  const source = readFileSync(new URL('./MemberPages.tsx', import.meta.url), 'utf8');
  const statusStart = source.indexOf('className="panel membership-card subscription-status-card"');
  const statusBlock = source.slice(statusStart - 80, statusStart + 1400);

  expect(statusStart).toBeGreaterThan(-1);
  expect(statusBlock).not.toContain('{subscriptionPurchaseVisible && <section className="panel membership-card subscription-status-card">');
  expect(statusBlock).toContain('{subscriptionPurchaseVisible && <button type="button" className="subscription-entry"');
});
