import { describe, expect, it } from 'vitest';
import { createAnalysisStore, type AnalysisStoreAdapter } from './matrix-analysis-store';

type Stored = Record<string, unknown> & { id: string };

function memoryAdapter() {
  const tables = new Map<string, Stored[]>();
  let nextId = 1;
  const adapter: AnalysisStoreAdapter = {
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
    async delete(table, ids) {
      const current = tables.get(table) ?? [];
      tables.set(table, current.filter((item) => !ids.includes(item.id)));
      return ids.map(() => true);
    },
  };
  return { adapter, tables };
}

const meta = {
  kind: 'explore' as const,
  lottery: '今彩539' as const,
  drawPeriod: '114000123',
  analysisVersion: '114000123:v1',
  startedAt: '2026-08-20T23:59:00Z',
  completedAt: '2026-08-21T00:00:00Z',
};

describe('Matrix analysis store', () => {
  it('never exposes a writing version', async () => {
    const { adapter } = memoryAdapter();
    const store = createAnalysisStore(adapter);

    await store.beginAnalysis(meta);
    await expect(store.readAnalysis('explore', '今彩539')).resolves.toBeNull();

    await store.publishAnalysis(meta, { items: [1] });
    await expect(store.readAnalysis('explore', '今彩539')).resolves.toMatchObject({
      status: 'complete',
      data: { items: [1] },
    });
  });

  it('keeps exactly three days and deletes versions older than three days', async () => {
    const { adapter } = memoryAdapter();
    const store = createAnalysisStore(adapter);
    await store.publishAnalysis(meta, { items: [1] });

    await store.cleanupExpired(new Date('2026-08-24T00:00:00Z'));
    await expect(store.readAnalysis('explore', '今彩539')).resolves.not.toBeNull();

    await store.cleanupExpired(new Date('2026-08-24T00:00:00.001Z'));
    await expect(store.readAnalysis('explore', '今彩539')).resolves.toBeNull();
  });

  it('can read the exact committed analysis version after a newer version is published', async () => {
    const { adapter } = memoryAdapter();
    const store = createAnalysisStore(adapter);
    const first = { ...meta, analysisVersion: 'v1', completedAt: '2026-08-21T00:00:00.000Z' };
    const second = { ...meta, analysisVersion: 'v2', completedAt: '2026-08-21T00:01:00.000Z' };
    await store.publishAnalysis(first, { value: 'first' });
    await store.publishAnalysis(second, { value: 'second' });
    await expect(store.readAnalysis('explore', '今彩539', '114000123', 'v1')).resolves.toMatchObject({ analysisVersion: 'v1', data: { value: 'first' } });
  });

  it('rejects an incomplete chunk set instead of returning mixed data', async () => {
    const { adapter, tables } = memoryAdapter();
    const store = createAnalysisStore(adapter);
    await store.publishAnalysis(meta, { value: '甲'.repeat(100_000) });
    const chunks = tables.get('matrix_analysis_chunks') ?? [];
    tables.set('matrix_analysis_chunks', chunks.slice(1));

    await expect(store.readAnalysis('explore', '今彩539')).rejects.toThrow(
      'MATRIX_ANALYSIS_CHUNKS_INCOMPLETE',
    );
  });
});
