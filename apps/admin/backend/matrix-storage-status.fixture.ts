// Explicit local/test fixture; never imported by the production status path.
export const matrixStorageFixture = () => ({
  checked_at: '2026-09-12T02:00:00Z', database_size_bytes: 2_500_000_000,
  tables: {
    explore: { size_bytes: 120_000_000, expired_total: 12, expired_retained: 2, expired_deletable: 10, superseded_rows: 15 },
    tianheng: { size_bytes: 80_000_000, expired_total: 0, expired_retained: 0, expired_deletable: 0, superseded_rows: 0 },
    artifacts: { size_bytes: 1_200_000_000, expired_total: 0, expired_retained: 0, expired_deletable: 0, superseded_rows: 0 },
    chunks: { size_bytes: 900_000_000, expired_total: 0, expired_retained: 0, expired_deletable: 0, superseded_rows: 0 },
  },
  active_versions: 24, active_unhealthy: 0, superseded_rows: 15, expired_deletable_rows: 10,
  cleanup: { job_name: 'analysis-retention', last_started_at: '2026-09-12T01:00:00Z' as string | null, last_finished_at: '2026-09-12T01:00:30Z' as string | null, last_deleted: 1_234, deletable_backlog: 10, last_error: null as string | null, cleanup_enabled: true },
  status: 'Healthy' as 'Healthy' | 'Warning' | 'Critical',
});
