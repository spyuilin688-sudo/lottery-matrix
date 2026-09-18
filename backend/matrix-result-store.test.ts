import { describe, expect, it, vi } from 'vitest';
import { createCompletedMatrixResultReader } from './matrix-result-store';

describe('legacy Matrix result compatibility', () => {
  it('reads a completed Explore artifact before the legacy request-key store', async () => {
    const readAnalysis = vi.fn(async () => ({ status: 'complete', data: { items: [1] } }));
    const readLegacy = vi.fn();
    const reader = createCompletedMatrixResultReader(readAnalysis, readLegacy);

    await expect(reader({ lottery: '今彩539', drawPeriod: '114000123' })).resolves.toEqual({ items: [1] });
    expect(readLegacy).not.toHaveBeenCalled();
  });

  it('falls back to the legacy store while no completed artifact exists', async () => {
    const readLegacy = vi.fn(async () => ({ valid: true }));
    const reader = createCompletedMatrixResultReader(async () => null, readLegacy);

    await expect(reader({ lottery: '今彩539', drawPeriod: '114000123' })).resolves.toEqual({ valid: true });
    expect(readLegacy).toHaveBeenCalledOnce();
  });
});
