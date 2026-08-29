// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest';
import { readManualTransferPlan, saveManualTransferPlan } from './manual-transfer-selection';

describe('manual transfer plan selection', () => {
  beforeEach(() => window.sessionStorage.clear());

  it('stores and reads a permitted plan code', () => {
    saveManualTransferPlan('year');
    expect(readManualTransferPlan()).toBe('year');
  });

  it('rejects an invalid stored plan code', () => {
    window.sessionStorage.setItem('matrix-manual-transfer-plan', 'invalid');
    expect(readManualTransferPlan()).toBeNull();
  });
});
