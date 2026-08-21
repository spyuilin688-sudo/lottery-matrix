import { db, storage } from '@appdeploy/sdk';
import type { LotteryId } from '../shared/matrix-contracts';

const JOB_TABLE = 'matrix_analysis_jobs';

type StoredRecord = Record<string, unknown> & { id: string };

export type MatrixAnalysisProgressAdapter = {
  list<T extends StoredRecord = StoredRecord>(
    table: string,
    options?: { limit?: number; nextToken?: string },
  ): Promise<{ items: T[]; nextToken?: string }>;
  add(table: string, records: Array<Record<string, unknown>>): Promise<Array<string | null>>;
  update(
    table: string,
    items: Array<{ id: string; record: Record<string, unknown> }>,
  ): Promise<boolean[]>;
  delete(table: string, ids: string[]): Promise<boolean[]>;
};

export type MatrixAnalysisProgressStorageAdapter = {
  write(items: Array<{ path: string; content: string; contentType: string }>): Promise<boolean[]>;
  read(paths: string[]): Promise<Array<{ path: string; content: string | null }>>;
  delete(paths: string[]): Promise<boolean[]>;
};

export type MatrixAnalysisJob = StoredRecord & {
  lottery: LotteryId;
  drawPeriod: string;
  analysisVersion: string;
  startedAt: string;
  phase: 'explore' | 'tianyan' | 'tiangong' | 'status';
  cursor: number;
  total: number;
};

async function listAll<T extends StoredRecord>(
  adapter: MatrixAnalysisProgressAdapter,
  table: string,
) {
  const items: T[] = [];
  let nextToken: string | undefined;
  do {
    const page = await adapter.list<T>(table, { limit: 100, ...(nextToken ? { nextToken } : {}) });
    items.push(...page.items);
    nextToken = page.nextToken;
  } while (nextToken);
  return items;
}

function hash(value: string) {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return (result >>> 0).toString(36);
}

function lotterySlug(lottery: LotteryId) {
  return lottery === '今彩539' ? '539'
    : lottery === '天天樂' ? 'fantasy5'
      : lottery === '六合彩' ? 'marksix'
        : 'lotto649';
}

function progressTable(job: MatrixAnalysisJob) {
  return `matrix_analysis_progress_${lotterySlug(job.lottery)}_${hash(`${job.drawPeriod}:${job.analysisVersion}`)}`;
}

function progressPrefix(job: MatrixAnalysisJob) {
  return `matrix-analysis-progress/${lotterySlug(job.lottery)}/${hash(`${job.drawPeriod}:${job.analysisVersion}`)}`;
}

function groupPath(job: MatrixAnalysisJob, unitIndex: number) {
  return `${progressPrefix(job)}/groups/${unitIndex}.json`;
}

function withoutId(record: StoredRecord) {
  const { id: _id, ...value } = record;
  return value;
}

export function createMatrixAnalysisProgressStore(
  adapter: MatrixAnalysisProgressAdapter,
  storageAdapter: MatrixAnalysisProgressStorageAdapter,
) {
  async function deleteIds(table: string, ids: string[]) {
    for (let index = 0; index < ids.length; index += 20) {
      const batch = ids.slice(index, index + 20);
      const deleted = await adapter.delete(table, batch);
      if (deleted.length !== batch.length || deleted.some((value) => !value)) {
        throw new Error('MATRIX_ANALYSIS_PROGRESS_DELETE_FAILED');
      }
    }
  }

  async function deleteJob(job: MatrixAnalysisJob) {
    const table = progressTable(job);
    const chunks = await listAll<StoredRecord>(adapter, table);
    await deleteIds(table, chunks.map((chunk) => chunk.id));
    for (let index = 0; index < job.total; index += 20) {
      await storageAdapter.delete(
        Array.from({ length: Math.min(20, job.total - index) }, (_, offset) => (
          groupPath(job, index + offset)
        )),
      );
    }
    await deleteIds(JOB_TABLE, [job.id]);
  }

  async function updateJob(job: MatrixAnalysisJob, changes: Partial<MatrixAnalysisJob>) {
    const updated = { ...job, ...changes };
    const [ok] = await adapter.update(JOB_TABLE, [{ id: job.id, record: withoutId(updated) }]);
    if (!ok) throw new Error('MATRIX_ANALYSIS_PROGRESS_UPDATE_FAILED');
    return updated;
  }

  return {
    async getOrCreate(input: Omit<MatrixAnalysisJob, 'id' | 'phase' | 'cursor'>) {
      const jobs = await listAll<MatrixAnalysisJob>(adapter, JOB_TABLE);
      const existing = jobs.find((job) => (
        job.lottery === input.lottery && job.drawPeriod === input.drawPeriod
      ));
      if (existing) return existing;
      for (const stale of jobs.filter((job) => (
        job.lottery === input.lottery && job.drawPeriod !== input.drawPeriod
      ))) {
        await deleteJob(stale);
      }
      const record = { ...input, phase: 'explore' as const, cursor: 0 };
      const [id] = await adapter.add(JOB_TABLE, [record]);
      if (!id) throw new Error('MATRIX_ANALYSIS_PROGRESS_CREATE_FAILED');
      return { ...record, id };
    },

    async appendExploreGroup(job: MatrixAnalysisJob, unitIndex: number, artifact: unknown) {
      if (job.phase !== 'explore' || unitIndex !== job.cursor) {
        throw new Error('MATRIX_ANALYSIS_PROGRESS_CURSOR_MISMATCH');
      }
      const [written] = await storageAdapter.write([{
        path: groupPath(job, unitIndex),
        content: JSON.stringify(artifact),
        contentType: 'application/json',
      }]);
      if (!written) throw new Error('MATRIX_ANALYSIS_PROGRESS_WRITE_FAILED');
      return updateJob(job, { cursor: unitIndex + 1 });
    },

    async readExploreGroups(job: MatrixAnalysisJob) {
      const artifacts: unknown[] = [];
      for (let index = 0; index < job.cursor; index += 10) {
        const paths = Array.from({ length: Math.min(10, job.cursor - index) }, (_, offset) => (
          groupPath(job, index + offset)
        ));
        const stored = await storageAdapter.read(paths);
        if (stored.length !== paths.length || stored.some((file) => file.content === null)) {
          throw new Error('MATRIX_ANALYSIS_PROGRESS_INCOMPLETE');
        }
        artifacts.push(...stored.map((file) => JSON.parse(String(file.content)) as unknown));
      }
      return artifacts;
    },

    setPhase(job: MatrixAnalysisJob, phase: MatrixAnalysisJob['phase']) {
      return updateJob(job, { phase, cursor: 0 });
    },

    async finish(job: MatrixAnalysisJob) {
      await deleteJob(job);
    },
  };
}

const appDeployAdapter: MatrixAnalysisProgressAdapter = {
  list: (table, options) => db.list(table, options),
  add: (table, records) => db.add(table, records),
  update: (table, items) => db.update(table, items),
  delete: (table, ids) => db.delete(table, ids),
};

const appDeployStorageAdapter: MatrixAnalysisProgressStorageAdapter = {
  write: (items) => storage.write(items),
  read: (paths) => storage.read(paths),
  delete: (paths) => storage.delete(paths),
};

export const matrixAnalysisProgressStore = createMatrixAnalysisProgressStore(
  appDeployAdapter,
  appDeployStorageAdapter,
);
