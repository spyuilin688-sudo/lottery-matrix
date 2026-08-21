import { describe, expect, it, vi } from 'vitest';
import { createMatrixAnalysisPipeline } from './matrix-analysis-pipeline';
import type { MatrixDraw } from './matrix-algorithm';

const history: MatrixDraw[] = [{ period: '114000123', drawDate: '2026-08-21', numbers: ['01', '02', '03', '04', '05'] }];

describe('Matrix completed-analysis pipeline', () => {
  it('builds all three artifacts before publishing them under one completed version', async () => {
    const calls: string[] = [];
    const publishAnalysis = vi.fn(async (meta, data) => { calls.push(`publish:${meta.kind}`); return { meta, data }; });
    const pipeline = createMatrixAnalysisPipeline({
      getHistory: async () => history,
      publishAnalysis,
      buildExplore: (lottery, period) => { calls.push('build:explore'); return { lottery, drawPeriod: period, items: [], validationById: {} }; },
      buildTianyan: (lottery, period) => { calls.push('build:tianyan'); return { lottery, drawPeriod: period, items: [], validationById: {} }; },
      buildTiangong: (lottery, period) => { calls.push('build:tiangong'); return { lottery, drawPeriod: period, items: [], validationById: {} }; },
      now: () => new Date('2026-08-21T01:02:03Z'),
    });
    await expect(pipeline.run('今彩539')).resolves.toMatchObject({ lottery: '今彩539', drawPeriod: '114000123' });
    expect(calls).toEqual([
      'build:explore', 'build:tianyan', 'build:tiangong',
      'publish:explore', 'publish:tianyan', 'publish:tiangong', 'publish:status',
    ]);
    expect(publishAnalysis.mock.calls[0][0]).toMatchObject({ analysisVersion: '114000123:matrix-v1:2026-08-21T01:02:03.000Z', drawPeriod: '114000123' });
    expect(publishAnalysis.mock.calls[3][1]).toEqual({ artifactKinds: ['explore', 'tianyan', 'tiangong'] });
  });

  it('uses complete history and builds all available artifacts before publishing any of them', async () => {
    const getHistory = vi.fn(async () => history);
    const publishAnalysis = vi.fn(async () => ({}));
    const pipeline = createMatrixAnalysisPipeline({
      getHistory,
      publishAnalysis,
      buildExplore: (lottery, period) => ({ lottery, drawPeriod: period, items: [], validationById: {} }),
      buildTianyan: (lottery, period) => ({ lottery, drawPeriod: period, items: [], validationById: {} }),
      buildTiangong: () => { throw new Error('TIANGONG_FAILED'); },
    });
    await expect(pipeline.run('今彩539')).rejects.toThrow('TIANGONG_FAILED');
    expect(getHistory).toHaveBeenCalledWith('今彩539', null);
    expect(publishAnalysis).not.toHaveBeenCalled();
  });

  it('does not publish a completion marker when Tiangong publication fails', async () => {
    const publishedKinds: string[] = [];
    const pipeline = createMatrixAnalysisPipeline({
      getHistory: async () => history,
      publishAnalysis: async (meta) => {
        publishedKinds.push(meta.kind);
        if (meta.kind === 'tiangong') throw new Error('TIANGONG_PUBLISH_FAILED');
        return {};
      },
      buildExplore: (lottery, period) => ({ lottery, drawPeriod: period, items: [], validationById: {} }),
      buildTianyan: (lottery, period) => ({ lottery, drawPeriod: period, items: [], validationById: {} }),
      buildTiangong: (lottery, period) => ({ lottery, drawPeriod: period, items: [], validationById: {} }),
    });
    await expect(pipeline.run('今彩539')).rejects.toThrow('TIANGONG_PUBLISH_FAILED');
    expect(publishedKinds).toEqual(['explore', 'tianyan', 'tiangong']);
    expect(publishedKinds).not.toContain('status');
  });

  it('fails rather than publishing sample data when history is empty', async () => {
    const pipeline = createMatrixAnalysisPipeline({ getHistory: async () => [], publishAnalysis: vi.fn() });
    await expect(pipeline.run('今彩539')).rejects.toThrow('MATRIX_HISTORY_NOT_READY');
  });

  it('builds the current draw when its completed Explore artifact is missing', async () => {
    const publishAnalysis = vi.fn(async () => ({}));
    const pipeline = createMatrixAnalysisPipeline({
      getHistory: async () => history,
      readAnalysis: async () => null,
      publishAnalysis,
      buildExplore: (lottery, period) => ({ lottery, drawPeriod: period, items: [], validationById: {} }),
      buildTianyan: (lottery, period) => ({ lottery, drawPeriod: period, items: [], validationById: {} }),
      buildTiangong: (lottery, period) => ({ lottery, drawPeriod: period, items: [], validationById: {} }),
    });
    await expect(pipeline.ensureCurrent('今彩539')).resolves.toMatchObject({ drawPeriod: '114000123' });
    expect(publishAnalysis).toHaveBeenCalledTimes(4);
  });

  it('skips recomputation when the current draw already has a completed Explore artifact', async () => {
    const publishAnalysis = vi.fn(async () => ({}));
    const pipeline = createMatrixAnalysisPipeline({
      getHistory: async () => history,
      readAnalysis: async () => ({ analysisVersion: 'existing' }),
      publishAnalysis,
    });
    await expect(pipeline.ensureCurrent('今彩539')).resolves.toEqual({
      lottery: '今彩539', drawPeriod: '114000123', skipped: true,
    });
    expect(publishAnalysis).not.toHaveBeenCalled();
  });
});
