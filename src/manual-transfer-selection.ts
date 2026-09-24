import type { ManualTransferPlanCode } from './member-api';
import { getMemberSessionSnapshot } from './auth/member-session-store';

const KEY = 'matrix-manual-transfer-plan';
const ATTEMPT_KEY = 'matrix-manual-transfer-attempt';
const VALUES = new Set<ManualTransferPlanCode>(['month', 'quarter', 'year']);

type TransferAttempt = { plan: ManualTransferPlanCode; lastFive: string; requestId: string };

function currentMemberId() {
  const owner = getMemberSessionSnapshot();
  return owner.status === 'ready' ? owner.session?.user?.id ?? null : null;
}
const attemptKey = (memberId: string) => `${ATTEMPT_KEY}:${memberId}`;

export function saveManualTransferPlan(value: ManualTransferPlanCode) {
  const memberId = currentMemberId();
  if (!memberId) throw new Error('MEMBER_SESSION_CHANGED');
  window.sessionStorage.setItem(KEY, JSON.stringify({ plan: value, memberId }));
}

export function readManualTransferPlan(): ManualTransferPlanCode | null {
  const memberId = currentMemberId();
  if (!memberId) return null;
  try {
    const value = JSON.parse(window.sessionStorage.getItem(KEY) ?? 'null');
    return value?.memberId === memberId && VALUES.has(value.plan)
      ? value.plan as ManualTransferPlanCode
      : null;
  } catch {
    return null;
  }
}

export function readManualTransferAttempt(): TransferAttempt | null {
  const memberId = currentMemberId();
  if (!memberId) return null;
  try {
    const value = JSON.parse(window.sessionStorage.getItem(attemptKey(memberId)) ?? 'null');
    return value?.memberId === memberId && VALUES.has(value.plan)
      && typeof value.lastFive === 'string' && /^[0-9]{5}$/.test(value.lastFive)
      && typeof value.requestId === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.requestId)
      ? { plan: value.plan, lastFive: value.lastFive, requestId: value.requestId }
      : null;
  } catch {
    return null;
  }
}

export function reserveManualTransferAttempt(plan: ManualTransferPlanCode, lastFive: string) {
  const previous = readManualTransferAttempt();
  if (previous) return previous.requestId;
  const memberId = currentMemberId();
  if (!memberId || !VALUES.has(plan) || !/^[0-9]{5}$/.test(lastFive)) throw new Error('INVALID_TRANSFER_ATTEMPT');
  const requestId = crypto.randomUUID();
  window.sessionStorage.setItem(attemptKey(memberId), JSON.stringify({ memberId, plan, lastFive, requestId }));
  return requestId;
}

export function clearManualTransferAttempt(requestId: string) {
  const memberId = currentMemberId();
  if (memberId && readManualTransferAttempt()?.requestId === requestId) {
    window.sessionStorage.removeItem(attemptKey(memberId));
  }
}
