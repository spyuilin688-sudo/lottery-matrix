import { describe, expect, it, vi } from 'vitest';
import { readReadyAnalysis } from './matrix-ready-analysis';

const artifact = { analysisVersion: 'v2', drawPeriod: '123', data: { items: [] } };

describe('completed Matrix generation gate', () => {
  it('returns an artifact only after a matching generation marker includes its kind', async () => {
    const read = vi.fn(async (kind: string, _lottery: string, _period?: string, version?: string) => kind === 'status'
      ? { analysisVersion: 'v2', drawPeriod: '123', data: { artifactKinds: ['explore', 'tianyan', 'tiangong'] } }
      : version === 'v2' ? artifact : null);
    await expect(readReadyAnalysis(read, 'explore', '今彩539')).resolves.toBe(artifact);
    expect(read).toHaveBeenLastCalledWith('explore', '今彩539', '123', 'v2');
    await expect(readReadyAnalysis(read, 'tiangong', '今彩539')).resolves.toBe(artifact);
    expect(read).toHaveBeenLastCalledWith('tiangong', '今彩539', '123', 'v2');
  });

  it('hides missing, mismatched and uncommitted artifacts', async () => {
    const mismatch = vi.fn(async (kind: string) => kind === 'status'
      ? { analysisVersion: 'v1', drawPeriod: '123', data: { artifactKinds: ['explore'] } }
      : artifact);
    await expect(readReadyAnalysis(mismatch, 'explore', '今彩539')).resolves.toBeNull();
    const uncommitted = vi.fn(async (kind: string) => kind === 'status'
      ? { analysisVersion: 'v2', drawPeriod: '123', data: { artifactKinds: ['explore', 'tianyan'] } }
      : artifact);
    await expect(readReadyAnalysis(uncommitted, 'tiangong', '今彩539')).resolves.toBeNull();
  });
});
