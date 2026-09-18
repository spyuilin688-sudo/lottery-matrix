import type { ManualTransferPlanCode } from './member-api';

const KEY = 'matrix-manual-transfer-plan';
const VALUES = new Set<ManualTransferPlanCode>(['month', 'quarter', 'year']);

export function saveManualTransferPlan(value: ManualTransferPlanCode) {
  window.sessionStorage.setItem(KEY, value);
}

export function readManualTransferPlan(): ManualTransferPlanCode | null {
  const value = window.sessionStorage.getItem(KEY);
  return VALUES.has(value as ManualTransferPlanCode)
    ? value as ManualTransferPlanCode
    : null;
}
