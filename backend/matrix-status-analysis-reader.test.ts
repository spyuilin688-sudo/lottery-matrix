import { describe, expect, it, vi } from 'vitest';
import { readStoredStatusExplore } from './matrix-status-analysis-reader';

describe('stored Matrix status Explore reader', () => {
  it('uses the compact background-computed Explore source from the completion marker', async () => {
    const explore = { lottery: '今彩539', drawPeriod: '115000204', items: [{ id: 'row' }], validationById: {} };
    const readAnalysis = vi.fn(async () => ({
      kind: 'status' as const,
      analysisVersion: '115000204:matrix-v4',
      drawPeriod: '115000204',
      data: { artifactKinds: ['explore', 'tianyan', 'tiangong'], explore },
    }));

    await expect(readStoredStatusExplore(readAnalysis, '今彩539')).resolves.toMatchObject({
      kind: 'explore',
      data: explore,
    });
    expect(readAnalysis).toHaveBeenCalledTimes(1);
    expect(readAnalysis).toHaveBeenCalledWith('status', '今彩539', undefined);
  });

  it('rejects legacy markers that would require loading every Explore partition per request', async () => {
    const readAnalysis = vi.fn(async () => ({
      analysisVersion: 'old', drawPeriod: '115000203', data: { artifactKinds: ['explore'] },
    }));
    await expect(readStoredStatusExplore(readAnalysis, '今彩539')).resolves.toBeNull();
  });

  it('rejects a compact source that does not belong to the marker lottery and period', async () => {
    const readAnalysis = vi.fn(async () => ({
      analysisVersion: 'v4', drawPeriod: '115000204',
      data: {
        artifactKinds: ['explore'],
        explore: { lottery: '大樂透', drawPeriod: '115000203', items: [], validationById: {} },
      },
    }));
    await expect(readStoredStatusExplore(readAnalysis, '今彩539')).resolves.toBeNull();
  });
});
