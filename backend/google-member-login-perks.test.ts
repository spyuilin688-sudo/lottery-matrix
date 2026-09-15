import { describe, expect, it, vi } from 'vitest';
import { resolveMatrixEntitlements } from './matrix-entitlements';
import { createMemberAuth } from './matrix-member-auth';

const config = async () => ({
  url: 'https://db.test',
  anonKey: 'anon-key',
  serviceRoleKey: 'service-key',
});

function jsonResponse(value: unknown) {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function memberFetcher(authUser: unknown) {
  const responses = [
    jsonResponse(authUser),
    jsonResponse([{
      id: 'member-1',
      auth_user_id: 'auth-1',
      status: '啟用',
      is_lifetime: false,
      plan_expires_at: null,
      current_plan: null,
      referral_code: null,
      line_trial_started_at: null,
    }]),
  ];
  return vi.fn(async () => {
    const response = responses.shift();
    if (!response) throw new Error('unexpected fetch');
    return response;
  });
}

describe('backend login promotional entitlement parity', () => {
  it.each([
    ['Google', { id: 'auth-1', app_metadata: { provider: 'google' } }],
    ['LINE', { id: 'auth-1', identities: [{ provider: 'custom:line' }] }],
  ])('%s member gets the Tue/Fri seven-period login perk', async (_label, authUser) => {
    const member = await createMemberAuth(
      config,
      memberFetcher(authUser),
      () => new Date('2026-09-15T16:00:00Z'),
    ).requireMember('Bearer token');

    expect(member.loginPerksEligible).toBe(true);
    expect(resolveMatrixEntitlements(member, new Date('2026-09-15T16:00:00Z')).canUseSeven).toBe(true);
  });

  it('does not give the Tue/Fri login perk to an email-only member', async () => {
    const member = await createMemberAuth(
      config,
      memberFetcher({ id: 'auth-1', app_metadata: { provider: 'email' } }),
      () => new Date('2026-09-15T16:00:00Z'),
    ).requireMember('Bearer token');

    expect(member.loginPerksEligible).toBe(false);
    expect(resolveMatrixEntitlements(member, new Date('2026-09-15T16:00:00Z')).canUseSeven).toBe(false);
  });
});
