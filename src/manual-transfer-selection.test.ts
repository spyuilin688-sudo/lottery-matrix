// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest';
import { readManualTransferPlan, saveManualTransferPlan, readManualTransferAttempt, reserveManualTransferAttempt, clearManualTransferAttempt } from './manual-transfer-selection';
import { publishMemberSessionReady, resetMemberSessionStoreForTests } from './auth/member-session-store';
import type { Session } from '@supabase/supabase-js';

const member = (id: string) => ({ user: { id }, access_token: id } as Session);

describe('manual transfer plan selection', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    resetMemberSessionStoreForTests();
    publishMemberSessionReady(member('member-a'));
  });

  it('stores and reads a permitted plan code', () => {
    saveManualTransferPlan('year');
    expect(readManualTransferPlan()).toBe('year');
  });

  it('rejects an invalid stored plan code', () => {
    window.sessionStorage.setItem('matrix-manual-transfer-plan', 'invalid');
    expect(readManualTransferPlan()).toBeNull();
  });

  it('does not expose one member’s fallback selection to another member', () => {
    saveManualTransferPlan('year');
    publishMemberSessionReady(member('member-b'));
    expect(readManualTransferPlan()).toBeNull();
  });

  it('reuses an unresolved request after reselecting the same plan and remounting', () => {
    saveManualTransferPlan('month');
    const first = reserveManualTransferAttempt('month', '12345');
    saveManualTransferPlan('month');
    expect(readManualTransferAttempt()).toEqual({ plan: 'month', lastFive: '12345', requestId: first });
    expect(reserveManualTransferAttempt('month', '12345')).toBe(first);
    expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });

  it('keeps the original payload locked until resolved, but hides it from another member', () => {
    const first = reserveManualTransferAttempt('month', '12345');
    expect(reserveManualTransferAttempt('year', '54321')).toBe(first);
    expect(readManualTransferAttempt()).toEqual({ plan: 'month', lastFive: '12345', requestId: first });
    publishMemberSessionReady(member('member-b'));
    expect(readManualTransferAttempt()).toBeNull();
    expect(reserveManualTransferAttempt('year', '54321')).not.toBe(first);
  });

  it('starts a new attempt after the acknowledged request is resolved', () => {
    const first = reserveManualTransferAttempt('month', '12345');
    clearManualTransferAttempt(first);
    expect(readManualTransferAttempt()).toBeNull();
    expect(reserveManualTransferAttempt('month', '12345')).not.toBe(first);
  });

  it('rejects a malformed stored request identifier', () => {
    window.sessionStorage.setItem('matrix-manual-transfer-attempt:member-a', JSON.stringify({
      memberId: 'member-a', plan: 'month', lastFive: '12345', requestId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    }));
    expect(readManualTransferAttempt()).toBeNull();
  });

  it('retains each member’s unresolved request while accounts switch in one tab', () => {
    const first = reserveManualTransferAttempt('month', '12345');
    publishMemberSessionReady(member('member-b'));
    const second = reserveManualTransferAttempt('year', '54321');
    expect(second).not.toBe(first);
    publishMemberSessionReady(member('member-a'));
    expect(readManualTransferAttempt()).toEqual({ plan: 'month', lastFive: '12345', requestId: first });
    publishMemberSessionReady(member('member-b'));
    expect(readManualTransferAttempt()).toEqual({ plan: 'year', lastFive: '54321', requestId: second });
  });
});
