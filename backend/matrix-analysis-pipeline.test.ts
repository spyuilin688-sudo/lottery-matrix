import { describe, expect, it, vi } from 'vitest';
import { createMatrixAnalysisPipeline } from './matrix-analysis-pipeline';
import type { MatrixDraw } from './matrix-algorithm';

const history: MatrixDraw[] = [{ period: '114000123', drawDate: '2026-08-21', numbers: ['01', '02', '03', '04', '05'] }];

describe('Matrix completed-analysis pipeline', () => {
  it('publishes completed Explore groups as a partition manifest without bulk-loading them', async () => {
    const published = new Map<string, unknown>();
    const groups: unknown[] = [];
    let job = {
      id: 'job-1', lottery: '今彩539' as const, drawPeriod: '114000123',
      analysisVersion: '114000123:matrix-v2', startedAt: '2026-08-21T01:02:03.000Z',
      phase: 'explore' as const, cursor: 0, total: 2,
    };
    const readExploreGroups = vi.fn(async () => groups);
    const progressStore = {
      getOrCreate: async () => job,
      appendExploreGroups: async (current: typeof job, unitIndex: number, artifacts: unknown[]) => {
        artifacts.forEach((artifact, offset) => { groups[unitIndex + offset] = artifact; });
        job = { ...current, cursor: unitIndex + artifacts.length };
        return job;
      },
      readExploreGroups,
      setPhase: async (current: typeof job, phase: typeof job.phase) => {
        job = { ...current, phase, cursor: 0 };
        return job;
      },
      finish: async () => undefined,
    };
    const buildTianyan = vi.fn((lottery, period) => ({ lottery, drawPeriod: period, items: [], validationById: {} }));
    const buildTiangong = vi.fn((lottery, period) => ({ lottery, drawPeriod: period, items: [], validationById: {} }));
    const publishAnalysis = vi.fn(async (meta, data) => {
      published.set(meta.kind, { analysisVersion: meta.analysisVersion, drawPeriod: meta.drawPeriod, data });
      return {};
    });
    const pipeline = createMatrixAnalysisPipeline({
      getHistory: async () => history,
      readAnalysis: async (kind) => published.get(kind) ?? null,
      publishAnalysis,
      createExploreWorkUnits: () => [{ id: 'unit-1' }, { id: 'unit-2' }] as never,
      buildExploreGroup: (_period, _history, unit: { id: string }) => ({
        lottery: '今彩539', drawPeriod: '114000123', items: [{ id: unit.id }], validationById: {},
      }) as never,
      mergeExplore: (lottery, period, artifacts) => ({
        lottery, drawPeriod: period, items: artifacts.flatMap((artifact: { items: unknown[] }) => artifact.items), validationById: {},
      }) as never,
      progressStore: progressStore as never,
      buildTianyan,
      buildTiangong,
      now: () => new Date('2026-08-21T01:02:03Z'),
    });

    await expect(pipeline.ensureCurrent('今彩539', { maxExploreGroups: 1 })).resolves.toMatchObject({ pending: true, phase: 'explore', cursor: 1, total: 2 });
    expect(publishAnalysis).not.toHaveBeenCalled();
    await expect(pipeline.ensureCurrent('今彩539', { maxExploreGroups: 1 })).resolves.toMatchObject({ pending: true, phase: 'tianyan' });
    expect(publishAnalysis.mock.calls.map(([meta]) => meta.kind)).toEqual(['explore']);
    expect(publishAnalysis.mock.calls[0][1]).toMatchObject({
      items: [],
      validationById: {},
      partitioned: {
        format: 'matrix-explore-partitioned-v1',
        job: { cursor: 2, total: 2 },
      },
    });
    expect(readExploreGroups).not.toHaveBeenCalled();
    await expect(pipeline.ensureCurrent('今彩539')).resolves.toMatchObject({
      pending: true,
      phase: 'tianyan',
    });
    expect(buildTianyan).not.toHaveBeenCalled();
    expect(buildTiangong).not.toHaveBeenCalled();
  });

  it('does not treat a lone Explore artifact as a completed current analysis', async () => {
    const pipeline = createMatrixAnalysisPipeline({
      getHistory: async () => history,
      readAnalysis: async (kind) => kind === 'explore' ? { analysisVersion: 'partial' } : null,
      createExploreWorkUnits: () => [] as never,
      progressStore: {
        getOrCreate: async () => ({
          id: 'job', lottery: '今彩539', drawPeriod: '114000123', analysisVersion: 'v2',
          startedAt: '2026-08-21T00:00:00Z', phase: 'explore', cursor: 0, total: 0,
        }),
        readExploreGroups: async () => [],
        setPhase: async (job, phase) => ({ ...job, phase, cursor: 0 }),
        appendExploreGroups: async () => { throw new Error('unexpected'); },
        finish: async () => undefined,
      } as never,
      publishAnalysis: vi.fn(async () => ({})),
      mergeExplore: (lottery, drawPeriod) => ({ lottery, drawPeriod, items: [], validationById: {} }),
    });

    await expect(pipeline.ensureCurrent('今彩539')).resolves.not.toMatchObject({ skipped: true });
  });

  it('stops adding Explore groups when the safe execution budget is reached', async () => {
    let job = {
      id: 'job', lottery: '今彩539' as const, drawPeriod: '114000123', analysisVersion: 'v2',
      startedAt: '2026-08-21T00:00:00Z', phase: 'explore' as const, cursor: 0, total: 2,
    };
    const buildExploreGroup = vi.fn((_period, _history, unit: { id: string }) => ({
      lottery: '今彩539', drawPeriod: '114000123', items: [{ id: unit.id }], validationById: {},
    })) as never;
    const times = [1_000, 23_000];
    const pipeline = createMatrixAnalysisPipeline({
      getHistory: async () => history,
      readAnalysis: async () => null,
      createExploreWorkUnits: () => [{ id: 'one' }, { id: 'two' }] as never,
      buildExploreGroup,
      monotonicNow: () => times.shift() ?? 23_000,
      progressStore: {
        getOrCreate: async () => job,
        appendExploreGroups: async (current, unitIndex, artifacts) => {
          job = { ...current, cursor: unitIndex + artifacts.length };
          return job;
        },
        readExploreGroups: async () => [],
        setPhase: async (current, phase) => ({ ...current, phase, cursor: 0 }),
        finish: async () => undefined,
      } as never,
    });

    await expect(pipeline.ensureCurrent('今彩539')).resolves.toMatchObject({
      pending: true, phase: 'explore', cursor: 1, total: 2,
    });
    expect(buildExploreGroup).toHaveBeenCalledTimes(1);
  });

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

  it('starts the current draw when its completion marker is missing', async () => {
    const publishAnalysis = vi.fn(async () => ({}));
    const progressStore = {
      getOrCreate: async () => ({
        id: 'job', lottery: '今彩539' as const, drawPeriod: '114000123', analysisVersion: 'v2',
        startedAt: '2026-08-21T00:00:00Z', phase: 'explore' as const, cursor: 0, total: 0,
      }),
      readExploreGroups: async () => [],
      setPhase: async (job: object, phase: string) => ({ ...job, phase, cursor: 0 }),
      appendExploreGroups: async () => { throw new Error('unexpected'); },
      finish: async () => undefined,
    };
    const pipeline = createMatrixAnalysisPipeline({
      getHistory: async () => history,
      readAnalysis: async () => null,
      publishAnalysis,
      createExploreWorkUnits: () => [],
      mergeExplore: (lottery, period) => ({ lottery, drawPeriod: period, items: [], validationById: {} }),
      progressStore: progressStore as never,
    });
    await expect(pipeline.ensureCurrent('今彩539')).resolves.toMatchObject({
      drawPeriod: '114000123', pending: true, phase: 'tianyan',
    });
    expect(publishAnalysis).toHaveBeenCalledTimes(1);
    expect(publishAnalysis.mock.calls[0][0]).toMatchObject({ kind: 'explore' });
  });

  it('restarts the current draw when only an older algorithm revision is complete', async () => {
    const pipeline = createMatrixAnalysisPipeline({
      getHistory: async () => history,
      readAnalysis: async (kind, _lottery, _drawPeriod, analysisVersion) => (
        kind === 'status' && analysisVersion !== '114000123:matrix-v3'
          ? { analysisVersion: '114000123:matrix-v2' }
          : null
      ),
      createExploreWorkUnits: () => [],
      progressStore: {
        getOrCreate: async () => ({
          id: 'job', lottery: '今彩539', drawPeriod: '114000123',
          analysisVersion: '114000123:matrix-v3', startedAt: '2026-08-21T00:00:00Z',
          phase: 'explore', cursor: 0, total: 0,
        }),
        readExploreGroups: async () => [],
        setPhase: async (job, phase) => ({ ...job, phase, cursor: 0 }),
        appendExploreGroups: async () => { throw new Error('unexpected'); },
        finish: async () => undefined,
      } as never,
      publishAnalysis: vi.fn(async () => ({})),
      mergeExplore: (lottery, drawPeriod) => ({
        lottery, drawPeriod, items: [], validationById: {},
      }),
    });

    await expect(pipeline.ensureCurrent('今彩539')).resolves.toMatchObject({
      drawPeriod: '114000123', pending: true, phase: 'tianyan',
    });
  });

  it('skips recomputation only when the current draw has a completion marker', async () => {
    const publishAnalysis = vi.fn(async () => ({}));
    const pipeline = createMatrixAnalysisPipeline({
      getHistory: async () => history,
      readAnalysis: async (kind) => kind === 'status' ? { analysisVersion: 'existing' } : null,
      publishAnalysis,
    });
    await expect(pipeline.ensureCurrent('今彩539')).resolves.toEqual({
      lottery: '今彩539', drawPeriod: '114000123', skipped: true,
    });
    expect(publishAnalysis).not.toHaveBeenCalled();
  });
});
