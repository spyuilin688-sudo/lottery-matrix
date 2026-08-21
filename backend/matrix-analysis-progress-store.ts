import { db } from '@appdeploy/sdk';
import type { LotteryId } from '../shared/matrix-contracts';

const JOB_TABLE = 'matrix_analysis_jobs';
const MAX_CHUNK_BYTES = 180_000;

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

export type MatrixAnalysisJob = StoredRecord & {
  lottery: LotteryId;
  drawPeriod: string;
  analysisVersion: string;
  startedAt: string;
  phase: 'explore' | 'tianyan' | 'tiangong' | 'status';
  cursor: number;
  total: number;
};

type ExploreProgressChunk = StoredRecord & {
  unitIndex: number;
  attemptId?: string;
  pieceIndex: number;
  pieceCount: number;
  payload: string;
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

function splitUtf8(value: string) {
  const encoder = new TextEncoder();
  const pieces: string[] = [];
  let start = 0;
  while (start < value.length) {
    let low = start + 1;
    let high = Math.min(value.length, start + MAX_CHUNK_BYTES);
    let best = start;
    while (low <= high) {
      const middle = Math.floor((low + high) / 2);
      if (encoder.encode(value.slice(start, middle)).byteLength <= MAX_CHUNK_BYTES) {
        best = middle;
        low = middle + 1;
      } else {
        high = middle - 1;
      }
    }
    if (best === start) throw new Error('MATRIX_ANALYSIS_PROGRESS_CHUNKING_FAILED');
    pieces.push(value.slice(start, best));
    start = best;
  }
  return pieces.length ? pieces : [''];
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

function withoutId(record: StoredRecord) {
  const { id: _id, ...value } = record;
  return value;
}

export function createMatrixAnalysisProgressStore(adapter: MatrixAnalysisProgressAdapter) {
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
    const chunks = await listAll<ExploreProgressChunk>(adapter, table);
    await deleteIds(table, chunks.map((chunk) => chunk.id));
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
      const table = progressTable(job);
      const attemptId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
      const pieces = splitUtf8(JSON.stringify(artifact));
      const records = pieces.map((payload, pieceIndex) => ({
        unitIndex, attemptId, pieceIndex, pieceCount: pieces.length, payload,
      }));
      for (let index = 0; index < records.length; index += 20) {
        const batch = records.slice(index, index + 20);
        const ids = await adapter.add(table, batch);
        if (ids.length !== batch.length || ids.some((id) => !id)) {
          throw new Error('MATRIX_ANALYSIS_PROGRESS_WRITE_FAILED');
        }
      }
      return updateJob(job, { cursor: unitIndex + 1 });
    },

    async readExploreGroups(job: MatrixAnalysisJob) {
      const chunks = await listAll<ExploreProgressChunk>(adapter, progressTable(job));
      const byUnit = new Map<number, Map<string, ExploreProgressChunk[]>>();
      for (const chunk of chunks) {
        const attempts = byUnit.get(chunk.unitIndex) ?? new Map<string, ExploreProgressChunk[]>();
        const attemptId = chunk.attemptId ?? 'legacy';
        const current = attempts.get(attemptId) ?? [];
        current.push(chunk);
        attempts.set(attemptId, current);
        byUnit.set(chunk.unitIndex, attempts);
      }
      const artifacts: unknown[] = [];
      for (let unitIndex = 0; unitIndex < job.cursor; unitIndex += 1) {
        const attempts = byUnit.get(unitIndex);
        const pieces = [...(attempts?.values() ?? [])].find((candidate) => {
          candidate.sort((left, right) => left.pieceIndex - right.pieceIndex);
          return candidate.length > 0
            && candidate.length === candidate[0].pieceCount
            && candidate.every((piece, index) => (
              piece.pieceIndex === index && piece.pieceCount === candidate.length
            ));
        });
        if (!pieces) throw new Error('MATRIX_ANALYSIS_PROGRESS_INCOMPLETE');
        artifacts.push(JSON.parse(pieces.map((piece) => piece.payload).join('')) as unknown);
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

export const matrixAnalysisProgressStore = createMatrixAnalysisProgressStore(appDeployAdapter);
