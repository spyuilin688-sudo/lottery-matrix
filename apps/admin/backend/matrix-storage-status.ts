// Pure RPC contract shared by the admin transport and presentation.
export const matrixStorageStatusId = 'matrix-storage';
const tableKeys = ['explore', 'tianheng', 'artifacts', 'chunks'] as const;
const metricKeys = ['size_bytes', 'expired_total', 'expired_retained', 'expired_deletable', 'superseded_rows'] as const;
type TableMetrics = Record<typeof metricKeys[number], number>;
export type MatrixStorageHealth = {
  checked_at: string;
  database_size_bytes: number;
  tables: Record<typeof tableKeys[number], TableMetrics>;
  active_versions: number;
  active_unhealthy: number;
  superseded_rows: number;
  expired_deletable_rows: number;
  cleanup: {
    job_name: 'analysis-retention'; last_started_at: string | null; last_finished_at: string | null;
    last_deleted: number; deletable_backlog: number; last_error: string | null; cleanup_enabled: boolean;
  };
  status: 'Healthy' | 'Warning' | 'Critical';
};
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const metric = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const timestamp = (value: unknown): value is string => typeof value === 'string'
  && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value))
  && new Date(`${value.slice(0, 10)}T00:00:00Z`).toISOString().slice(0, 10) === value.slice(0, 10);
const nullableTimestamp = (value: unknown): value is string | null => value === null || timestamp(value);

export function parseMatrixStorageHealth(value: unknown): MatrixStorageHealth | null {
  if (!record(value) || !timestamp(value.checked_at) || !metric(value.database_size_bytes)
    || !metric(value.active_versions) || !metric(value.active_unhealthy) || !metric(value.superseded_rows)
    || !metric(value.expired_deletable_rows) || !record(value.tables) || !record(value.cleanup)
    || typeof value.status !== 'string' || !['Healthy', 'Warning', 'Critical'].includes(value.status)) return null;
  const tables = {} as MatrixStorageHealth['tables'];
  for (const key of tableKeys) {
    const table = value.tables[key];
    if (!record(table) || !metricKeys.every(metricKey => metric(table[metricKey]))) return null;
    tables[key] = Object.fromEntries(metricKeys.map(metricKey => [metricKey, table[metricKey]])) as TableMetrics;
  }
  const cleanup = value.cleanup;
  if (cleanup.job_name !== 'analysis-retention' || !nullableTimestamp(cleanup.last_started_at)
    || !nullableTimestamp(cleanup.last_finished_at) || !metric(cleanup.last_deleted)
    || !metric(cleanup.deletable_backlog) || typeof cleanup.cleanup_enabled !== 'boolean'
    || !(cleanup.last_error === null || typeof cleanup.last_error === 'string')) return null;
  return {
    checked_at: value.checked_at, database_size_bytes: value.database_size_bytes, tables,
    active_versions: value.active_versions, active_unhealthy: value.active_unhealthy,
    superseded_rows: value.superseded_rows, expired_deletable_rows: value.expired_deletable_rows,
    cleanup: { job_name: cleanup.job_name, last_started_at: cleanup.last_started_at, last_finished_at: cleanup.last_finished_at,
      last_deleted: cleanup.last_deleted, deletable_backlog: cleanup.deletable_backlog, last_error: cleanup.last_error, cleanup_enabled: cleanup.cleanup_enabled },
    status: value.status as MatrixStorageHealth['status'],
  };
}
