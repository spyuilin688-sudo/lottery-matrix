import { db } from '@appdeploy/sdk';
import type { LotteryId, MatrixAnalysisKind } from '../shared/matrix-contracts';

const MANIFEST_TABLE = 'matrix_analysis_manifests';
const CHUNK_TABLE = 'matrix_analysis_chunks';
const MAX_CHUNK_BYTES = 180_000;
const RETENTION_MS = 3 * 24 * 60 * 60 * 1_000;

type StoredRecord = Record<string, unknown> & { id: string };

export type AnalysisStoreAdapter = {
  list(
    table: string,
    options?: { limit?: number; nextToken?: string },
  ): Promise<{ items: StoredRecord[]; nextToken?: string }>;
  add(table: string, records: Array<Record<string, unknown>>): Promise<string[]>;
  delete(table: string, ids: string[]): Promise<boolean[]>;
};

export type AnalysisWriteMeta = {
  kind: MatrixAnalysisKind;
  lottery: LotteryId;
  drawPeriod: string;
  analysisVersion: string;
  startedAt: string;
  completedAt: string;
};

type AnalysisManifest = StoredRecord & AnalysisWriteMeta & {
  status: 'writing' | 'complete';
  chunkCount?: number;
  itemCount?: number;
  expiresAt?: string;
};

type AnalysisChunk = StoredRecord & {
  kind: MatrixAnalysisKind;
  lottery: LotteryId;
  drawPeriod: string;
  analysisVersion: string;
  chunkIndex: number;
  chunkCount: number;
  payload: string;
};

async function listAll(adapter: AnalysisStoreAdapter, table: string) {
  const items: StoredRecord[] = [];
  let nextToken: string | undefined;
  do {
    const page = await adapter.list(table, { limit: 100, ...(nextToken ? { nextToken } : {}) });
    items.push(...page.items);
    nextToken = page.nextToken;
  } while (nextToken);
  return items;
}

function splitUtf8(value: string) {
  const encoder = new TextEncoder();
  const chunks: string[] = [];
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
    if (best === start) throw new Error('MATRIX_ANALYSIS_CHUNKING_FAILED');
    chunks.push(value.slice(start, best));
    start = best;
  }
  return chunks.length ? chunks : [''];
}

function sameVersion(record: Record<string, unknown>, meta: AnalysisWriteMeta) {
  return record.kind === meta.kind
    && record.lottery === meta.lottery
    && record.drawPeriod === meta.drawPeriod
    && record.analysisVersion === meta.analysisVersion;
}

async function deleteBatches(adapter: AnalysisStoreAdapter, table: string, ids: string[]) {
  for (let index = 0; index < ids.length; index += 20) {
    const batch = ids.slice(index, index + 20);
    const deleted = await adapter.delete(table, batch);
    if (deleted.length !== batch.length || deleted.some((value) => !value)) {
      throw new Error('MATRIX_ANALYSIS_DELETE_FAILED');
    }
  }
}

function itemCount(data: unknown) {
  if (Array.isArray(data)) return data.length;
  if (data && typeof data === 'object' && Array.isArray((data as { items?: unknown }).items)) {
    return ((data as { items: unknown[] }).items).length;
  }
  return 1;
}

export function createAnalysisStore(
  adapter: AnalysisStoreAdapter,
  clock: () => Date = () => new Date(),
) {
  async function matchingManifests(kind: MatrixAnalysisKind, lottery: LotteryId) {
    return (await listAll(adapter, MANIFEST_TABLE))
      .filter((item) => item.kind === kind && item.lottery === lottery) as AnalysisManifest[];
  }

  async function readAnalysis(
    kind: MatrixAnalysisKind,
    lottery: LotteryId,
    drawPeriod?: string,
    analysisVersion?: string,
  ) {
    const manifests = (await matchingManifests(kind, lottery))
      .filter((item) => item.status === 'complete')
      .filter((item) => !drawPeriod || item.drawPeriod === drawPeriod)
      .filter((item) => !analysisVersion || item.analysisVersion === analysisVersion)
      .filter((item) => Date.parse(String(item.expiresAt ?? '')) >= clock().getTime())
      .sort((left, right) => String(right.completedAt).localeCompare(String(left.completedAt)));
    const manifest = manifests[0];
    if (!manifest) return null;

    const chunks = (await listAll(adapter, CHUNK_TABLE))
      .filter((item) => sameVersion(item, manifest)) as AnalysisChunk[];
    chunks.sort((left, right) => left.chunkIndex - right.chunkIndex);
    if (
      chunks.length !== manifest.chunkCount
      || chunks.some((chunk, index) => chunk.chunkCount !== manifest.chunkCount || chunk.chunkIndex !== index)
    ) {
      throw new Error('MATRIX_ANALYSIS_CHUNKS_INCOMPLETE');
    }

    return {
      kind: manifest.kind,
      lottery: manifest.lottery,
      drawPeriod: manifest.drawPeriod,
      analysisVersion: manifest.analysisVersion,
      status: 'complete' as const,
      startedAt: manifest.startedAt,
      completedAt: manifest.completedAt,
      expiresAt: manifest.expiresAt,
      itemCount: manifest.itemCount,
      data: JSON.parse(chunks.map((chunk) => chunk.payload).join('')) as unknown,
    };
  }

  return {
    async beginAnalysis(meta: AnalysisWriteMeta) {
      const [id] = await adapter.add(MANIFEST_TABLE, [{
        ...meta,
        status: 'writing',
        completedAt: '',
      }]);
      if (!id) throw new Error('MATRIX_ANALYSIS_BEGIN_FAILED');
    },

    async publishAnalysis(meta: AnalysisWriteMeta, data: unknown) {
      const existing = await readAnalysis(meta.kind, meta.lottery, meta.drawPeriod);
      if (existing?.analysisVersion === meta.analysisVersion) return existing;

      const allChunks = await listAll(adapter, CHUNK_TABLE);
      await deleteBatches(
        adapter,
        CHUNK_TABLE,
        allChunks.filter((item) => sameVersion(item, meta)).map((item) => item.id),
      );

      const pieces = splitUtf8(JSON.stringify(data));
      const records = pieces.map((payload, chunkIndex) => ({
        kind: meta.kind,
        lottery: meta.lottery,
        drawPeriod: meta.drawPeriod,
        analysisVersion: meta.analysisVersion,
        chunkIndex,
        chunkCount: pieces.length,
        payload,
      }));
      for (let index = 0; index < records.length; index += 20) {
        const batch = records.slice(index, index + 20);
        const ids = await adapter.add(CHUNK_TABLE, batch);
        if (ids.length !== batch.length || ids.some((id) => !id)) {
          throw new Error('MATRIX_ANALYSIS_CHUNK_WRITE_FAILED');
        }
      }

      const written = (await listAll(adapter, CHUNK_TABLE))
        .filter((item) => sameVersion(item, meta)) as AnalysisChunk[];
      if (written.length !== pieces.length) throw new Error('MATRIX_ANALYSIS_CHUNK_VERIFY_FAILED');

      const completedAtMs = Date.parse(meta.completedAt);
      if (!Number.isFinite(completedAtMs)) throw new Error('MATRIX_ANALYSIS_COMPLETED_AT_INVALID');
      const [manifestId] = await adapter.add(MANIFEST_TABLE, [{
        ...meta,
        status: 'complete',
        chunkCount: pieces.length,
        itemCount: itemCount(data),
        expiresAt: new Date(completedAtMs + RETENTION_MS).toISOString(),
      }]);
      if (!manifestId) throw new Error('MATRIX_ANALYSIS_MANIFEST_WRITE_FAILED');

      const manifests = await listAll(adapter, MANIFEST_TABLE);
      await deleteBatches(
        adapter,
        MANIFEST_TABLE,
        manifests
          .filter((item) => item.status === 'writing' && sameVersion(item, meta))
          .map((item) => item.id),
      );
      return readAnalysis(meta.kind, meta.lottery, meta.drawPeriod);
    },

    readAnalysis,

    async cleanupExpired(now: Date) {
      const manifests = (await listAll(adapter, MANIFEST_TABLE)) as AnalysisManifest[];
      const expired = manifests.filter((item) => (
        item.status === 'complete'
        && Date.parse(String(item.expiresAt ?? '')) < now.getTime()
      ));
      const chunks = await listAll(adapter, CHUNK_TABLE);
      for (const manifest of expired) {
        await deleteBatches(
          adapter,
          CHUNK_TABLE,
          chunks.filter((item) => sameVersion(item, manifest)).map((item) => item.id),
        );
        await deleteBatches(adapter, MANIFEST_TABLE, [manifest.id]);
      }
      return { deletedVersions: expired.length };
    },
  };
}

const appDeployAdapter: AnalysisStoreAdapter = {
  async list(table, options) {
    return db.list(table, options) as Promise<{ items: StoredRecord[]; nextToken?: string }>;
  },
  async add(table, records) {
    return db.add(table, records);
  },
  async delete(table, ids) {
    return db.delete(table, ids);
  },
};

export const analysisStore = createAnalysisStore(appDeployAdapter);
