import { describe, expect, it } from 'vitest';
import {
  createMatrixAnalysisProgressStore,
  type MatrixAnalysisProgressAdapter,
  type MatrixAnalysisProgressStorageAdapter,
} from './matrix-analysis-progress-store';

type Stored = Record<string, unknown> & { id: string };

function memoryAdapter() {
  const tables = new Map<string, Stored[]>();
  let nextId = 1;
  const adapter: MatrixAnalysisProgressAdapter = {
    async list<T>(table: string) {
      return { items: [...(tables.get(table) ?? [])] as T[] };
    },
    async add(table, records) {
      const current = tables.get(table) ?? [];
      const ids = records.map((record) => {
        const id = String(nextId++);
        current.push({ ...record, id });
        return id;
      });
      tables.set(table, current);
      return ids;
    },
    async update(table, items) {
      const current = tables.get(table) ?? [];
      return items.map(({ id, record }) => {
        const index = current.findIndex((item) => item.id === id);
        if (index < 0) return false;
        current[index] = { ...record, id };
        return true;
      });
    },
    async delete(table, ids) {
      const current = tables.get(table) ?? [];
      tables.set(table, current.filter((item) => !ids.includes(item.id)));
      return ids.map(() => true);
    },
  };
  return { adapter, tables };
}

function memoryStorage() {
  const files = new Map<string, string>();
  const state = { writeCalls: 0 };
  const adapter: MatrixAnalysisProgressStorageAdapter = {
    async write(items) {
      state.writeCalls += 1;
      for (const item of items) files.set(item.path, item.content);
      return items.map(() => true);
    },
    async read(paths) {
      return paths.map((path) => ({ path, content: files.get(path) ?? null }));
    },
    async delete(paths) {
      return paths.map((path) => files.delete(path));
    },
  };
  return { adapter, files, state };
}

describe('Matrix analysis resumable progress store', () => {
  it('persists one completed Explore group before advancing its cursor', async () => {
    const { adapter, tables } = memoryAdapter();
    const saved = memoryStorage();
    const store = createMatrixAnalysisProgressStore(adapter, saved.adapter);
    const job = await store.getOrCreate({
      lottery: '今彩539',
      drawPeriod: '114000123',
      analysisVersion: '114000123:matrix-v2',
      startedAt: '2026-08-21T10:00:00.000Z',
      total: 390,
    });
    const artifact = {
      lottery: '今彩539' as const,
      drawPeriod: '114000123',
      items: [{ id: 'group-1', payload: '甲'.repeat(100_000) }],
      validationById: {},
    };

    const advanced = await store.appendExploreGroup(job, 0, artifact);

    expect(advanced).toMatchObject({ phase: 'explore', cursor: 1, total: 390 });
    await expect(store.readExploreGroups(advanced)).resolves.toEqual([artifact]);
    expect(saved.files.size).toBe(1);
    expect([...saved.files.values()][0].length).toBeLessThan(JSON.stringify(artifact).length);
    expect([...tables.keys()].filter((name) => name.startsWith('matrix_analysis_progress_'))).toEqual([]);
  });

  it('resumes the existing current-period job instead of creating another one', async () => {
    const { adapter, tables } = memoryAdapter();
    const store = createMatrixAnalysisProgressStore(adapter, memoryStorage().adapter);
    const first = await store.getOrCreate({
      lottery: '今彩539', drawPeriod: '114000123', analysisVersion: 'v1',
      startedAt: '2026-08-21T10:00:00.000Z', total: 390,
    });
    const resumed = await store.getOrCreate({
      lottery: '今彩539', drawPeriod: '114000123', analysisVersion: 'v1',
      startedAt: '2026-08-21T10:01:00.000Z', total: 390,
    });

    expect(resumed.id).toBe(first.id);
    expect(resumed.analysisVersion).toBe('v1');
    expect(tables.get('matrix_analysis_jobs')).toHaveLength(1);
  });

  it('abandons same-period progress from an older algorithm revision', async () => {
    const { adapter, tables } = memoryAdapter();
    const saved = memoryStorage();
    const store = createMatrixAnalysisProgressStore(adapter, saved.adapter);
    const oldJob = await store.getOrCreate({
      lottery: '今彩539', drawPeriod: '114000123', analysisVersion: '114000123:matrix-v2',
      startedAt: '2026-08-21T10:00:00.000Z', total: 390,
    });
    await store.appendExploreGroup(oldJob, 0, { id: 'old-result' });

    const currentJob = await store.getOrCreate({
      lottery: '今彩539', drawPeriod: '114000123', analysisVersion: '114000123:matrix-v3',
      startedAt: '2026-08-21T10:01:00.000Z', total: 390,
    });

    expect(currentJob.id).not.toBe(oldJob.id);
    expect(currentJob.analysisVersion).toBe('114000123:matrix-v3');
    expect(tables.get('matrix_analysis_jobs')).toEqual([
      expect.objectContaining({ id: currentJob.id, analysisVersion: '114000123:matrix-v3' }),
    ]);
    expect(saved.files.size).toBe(0);
  });

  it('persists multiple completed units with one storage write before advancing the cursor', async () => {
    const { adapter } = memoryAdapter();
    const saved = memoryStorage();
    const store = createMatrixAnalysisProgressStore(adapter, saved.adapter);
    const job = await store.getOrCreate({
      lottery: '六合彩', drawPeriod: '20260821', analysisVersion: 'v1',
      startedAt: '2026-08-21T10:00:00.000Z', total: 546,
    });

    const advanced = await store.appendExploreGroups(job, 0, [{ id: 'one' }, { id: 'two' }]);

    expect(advanced.cursor).toBe(2);
    expect(saved.state.writeCalls).toBe(1);
    await expect(store.readExploreGroups(advanced)).resolves.toEqual([{ id: 'one' }, { id: 'two' }]);
  });

  it('abandons unfinished progress from an older draw when a newer draw becomes current', async () => {
    const { adapter, tables } = memoryAdapter();
    const saved = memoryStorage();
    const store = createMatrixAnalysisProgressStore(adapter, saved.adapter);
    const oldJob = await store.getOrCreate({
      lottery: '今彩539', drawPeriod: '114000122', analysisVersion: 'old',
      startedAt: '2026-08-20T10:00:00.000Z', total: 390,
    });
    await store.appendExploreGroup(oldJob, 0, { id: 'old-result' });

    const currentJob = await store.getOrCreate({
      lottery: '今彩539', drawPeriod: '114000123', analysisVersion: 'current',
      startedAt: '2026-08-21T10:00:00.000Z', total: 390,
    });

    expect(currentJob.drawPeriod).toBe('114000123');
    expect(tables.get('matrix_analysis_jobs')).toEqual([
      expect.objectContaining({ id: currentJob.id, drawPeriod: '114000123' }),
    ]);
    expect(saved.files.size).toBe(0);
  });
});
