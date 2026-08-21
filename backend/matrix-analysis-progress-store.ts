import { db, storage } from '@appdeploy/sdk';
import type { LotteryId } from '../shared/matrix-contracts';
import { readExploreGroupArtifacts } from './matrix-analysis-progress-reader';

const JOB_TABLE = 'matrix_analysis_jobs';
const PROGRESS_RETENTION_MS = 3 * 24 * 60 * 60 * 1_000;

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
  return `${progressPrefix(job)}/groups/${unitIndex}.json.gz`;
}

function legacyGroupPath(job: MatrixAnalysisJob, unitIndex: number) {
  return `${progressPrefix(job)}/groups/${unitIndex}.json`;
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 32_768) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 32_768));
  }
  return btoa(binary);
}

function base64ToBytes(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

async function encodeArtifact(artifact: unknown) {
  const stream = new Blob([JSON.stringify(artifact)])
    .stream()
    .pipeThrough(new CompressionStream('gzip'));
  return bytesToBase64(new Uint8Array(await new Response(stream).arrayBuffer()));
}

async function decodeArtifact(value: string) {
  const stream = new Blob([base64ToBytes(value)])
    .stream()
    .pipeThrough(new DecompressionStream('gzip'));
  return JSON.parse(await new Response(stream).text()) as unknown;
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
      const indexes = Array.from(
        { length: Math.min(20, job.total - index) },
        (_, offset) => index + offset,
      );
      await storageAdapter.delete([
        ...indexes.map((unitIndex) => groupPath(job, unitIndex)),
        ...indexes.map((unitIndex) => legacyGroupPath(job, unitIndex)),
      ]);
    }
    await deleteIds(JOB_TABLE, [job.id]);
  }

  async function updateJob(job: MatrixAnalysisJob, changes: Partial<MatrixAnalysisJob>) {
    const updated = { ...job, ...changes };
    const [ok] = await adapter.update(JOB_TABLE, [{ id: job.id, record: withoutId(updated) }]);
    if (!ok) throw new Error('MATRIX_ANALYSIS_PROGRESS_UPDATE_FAILED');
    return updated;
  }

  async function readExploreGroupIndexes(job: MatrixAnalysisJob, indexes: number[]) {
    if (indexes.some((index) => !Number.isInteger(index) || index < 0 || index >= job.cursor)) {
      throw new Error('MATRIX_ANALYSIS_PROGRESS_INDEX_INVALID');
    }
    const paths = indexes.map((index) => groupPath(job, index));
    const legacyPaths = indexes.map((index) => legacyGroupPath(job, index));
    return readExploreGroupArtifacts(
      storageAdapter,
      paths,
      legacyPaths,
      decodeArtifact,
      value => JSON.parse(value) as unknown,
    );
  }

  return {
    async getOrCreate(input: Omit<MatrixAnalysisJob, 'id' | 'phase' | 'cursor'>) {
      const jobs = await listAll<MatrixAnalysisJob>(adapter, JOB_TABLE);
      const sameDraw = jobs.find((job) => (
        job.lottery === input.lottery
        && job.drawPeriod === input.drawPeriod
      ));
      if (sameDraw?.analysisVersion === input.analysisVersion) return sameDraw;
      if (sameDraw) {
        return updateJob(sameDraw, {
          ...input,
          phase: 'explore',
          cursor: 0,
        });
      }
      const retentionCutoff = Date.parse(input.startedAt) - PROGRESS_RETENTION_MS;
      for (const stale of jobs.filter((job) => (
        job.lottery === input.lottery
        && job.drawPeriod !== input.drawPeriod
        && Number.isFinite(retentionCutoff)
        && Date.parse(job.startedAt) < retentionCutoff
      ))) {
        await deleteJob(stale);
      }
      const record = { ...input, phase: 'explore' as const, cursor: 0 };
      const [id] = await adapter.add(JOB_TABLE, [record]);
      if (!id) throw new Error('MATRIX_ANALYSIS_PROGRESS_CREATE_FAILED');
      return { ...record, id };
    },

    async appendExploreGroups(job: MatrixAnalysisJob, unitIndex: number, artifacts: unknown[]) {
      if (job.phase !== 'explore' || unitIndex !== job.cursor) {
        throw new Error('MATRIX_ANALYSIS_PROGRESS_CURSOR_MISMATCH');
      }
      if (artifacts.length === 0 || unitIndex + artifacts.length > job.total) {
        throw new Error('MATRIX_ANALYSIS_PROGRESS_BATCH_INVALID');
      }
      const encoded = await Promise.all(artifacts.map((artifact) => encodeArtifact(artifact)));
      const written = await storageAdapter.write(encoded.map((content, offset) => ({
        path: groupPath(job, unitIndex + offset),
        content,
        contentType: 'application/gzip',
      })));
      if (written.length !== artifacts.length || written.some((ok) => !ok)) {
        throw new Error('MATRIX_ANALYSIS_PROGRESS_WRITE_FAILED');
      }
      return updateJob(job, { cursor: unitIndex + artifacts.length });
    },

    appendExploreGroup(job: MatrixAnalysisJob, unitIndex: number, artifact: unknown) {
      return this.appendExploreGroups(job, unitIndex, [artifact]);
    },

    readExploreGroupIndexes,

    readExploreGroups(job: MatrixAnalysisJob) {
      return readExploreGroupIndexes(
        job,
        Array.from({ length: job.cursor }, (_, index) => index),
      );
    },

    setPhase(job: MatrixAnalysisJob, phase: MatrixAnalysisJob['phase']) {
      return updateJob(job, { phase, cursor: 0 });
    },

    async finish(_job: MatrixAnalysisJob) {
      // Explore partitions remain available for the three-day analysis retention window.
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
