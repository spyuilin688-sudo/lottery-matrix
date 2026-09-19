import { inspectChain, type Diagnosis } from './matrix-inspector';
import { sanitizeRailwayEvidence, type RailwayEvidence } from './matrix-railway-evidence';
import { sanitizeOptimizer, type OptimizerReport } from './matrix-optimizer';
import { sanitizeChainReports, type ChainReport } from './matrix-chain';
type Row = Record<string, unknown>;

type WatchdogStatusDatabase = {
  list<T>(table: string, options: { limit: number }): Promise<{
    items: Array<Omit<T, 'id'> & { id: string }>;
    nextToken?: string;
  }>;
  add(table: string, records: Row[]): Promise<(string | null)[]>;
  update(table: string, updates: { id: string; record: Row }[]): Promise<boolean[]>;
};

export type WatchdogStatusAction = {
  lottery: '今彩539' | '天天樂' | '六合彩' | '大樂透';
  target: 'github' | 'railway';
  reasons: string[];
  outcome: 'lease-held' | 'dispatched' | 'already-running' | 'accepted' | 'config-missing' | 'failed';
};

export type WatchdogStatus = {
  status: 'ok' | 'degraded';
  reports?: ChainReport[];
  diagnoses?: Diagnosis[];
  railway?: RailwayEvidence[];
  optimizer?: OptimizerReport;
  checkedAt: string;
  completedAt: string;
  nextCheckAt?: string;
  dueLotteries: WatchdogStatusAction['lottery'][];
  actions: WatchdogStatusAction[];
  error?: 'STATUS_UNAVAILABLE' | 'WATCHDOG_FAILED' | 'WATCHDOG_STATUS_WRITE_FAILED';
};

const TABLE = 'matrix-watchdog-status';
const LOTTERIES = new Set<WatchdogStatusAction['lottery']>(['今彩539', '天天樂', '六合彩', '大樂透']);
const TARGETS = new Set<WatchdogStatusAction['target']>(['github', 'railway']);
const REASONS = new Set([
  'matrix-status-missing',
  'job-failed',
  'job-stuck',
  'crawler-stale',
  'analysis-missing',
  'analysis-failed',
  'analysis-stuck',
]);
const OUTCOMES = new Set<WatchdogStatusAction['outcome']>([
  'lease-held',
  'dispatched',
  'already-running',
  'accepted',
  'config-missing',
  'failed',
]);
const SAFE_ERRORS = new Set<NonNullable<WatchdogStatus['error']>>([
  'STATUS_UNAVAILABLE',
  'WATCHDOG_FAILED',
  'WATCHDOG_STATUS_WRITE_FAILED',
]);

const isRow = (value: unknown): value is Row =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

function safeTimestamp(value: unknown, fallback = new Date(0).toISOString()): string {
  if (typeof value !== 'string') return fallback;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : fallback;
}

function safeDueLotteries(value: unknown): WatchdogStatusAction['lottery'][] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<WatchdogStatusAction['lottery']>();
  for (const lottery of value) {
    if (LOTTERIES.has(lottery as WatchdogStatusAction['lottery'])) {
      seen.add(lottery as WatchdogStatusAction['lottery']);
    }
  }
  return [...seen];
}

function safeActions(value: unknown): WatchdogStatusAction[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 8).flatMap((candidate) => {
    if (!isRow(candidate)) return [];
    const lottery = candidate.lottery as WatchdogStatusAction['lottery'];
    const target = candidate.target as WatchdogStatusAction['target'];
    const outcome = candidate.outcome as WatchdogStatusAction['outcome'];
    if (!LOTTERIES.has(lottery) || !TARGETS.has(target) || !OUTCOMES.has(outcome)) return [];
    const reasons = Array.isArray(candidate.reasons)
      ? candidate.reasons.filter((reason): reason is string => typeof reason === 'string' && REASONS.has(reason)).slice(0, 6)
      : [];
    return [{ lottery, target, reasons, outcome }];
  });
}

export function sanitizeWatchdogStatus(value: unknown): WatchdogStatus {
  const source = isRow(value) ? value : {};
  const status: WatchdogStatus['status'] = source.status === 'ok' ? 'ok' : 'degraded';
  const checkedAt = safeTimestamp(source.checkedAt);
  const result: WatchdogStatus = {
    status,
    checkedAt,
    completedAt: safeTimestamp(source.completedAt, checkedAt),
    dueLotteries: safeDueLotteries(source.dueLotteries),
    actions: safeActions(source.actions),
  };
  const nextCheck = typeof source.nextCheckAt === 'string' ? Date.parse(source.nextCheckAt) : NaN;
  const checked = Date.parse(checkedAt);
  if (Number.isFinite(nextCheck) && nextCheck > checked && nextCheck <= checked + 10 * 86400000) {
    result.nextCheckAt = new Date(nextCheck).toISOString();
  }
  if (Array.isArray(source.reports)) {
    result.reports = sanitizeChainReports(source.reports);
    if (result.reports.length !== 4 || result.reports.some(r => r.state !== 'PASS')) result.status = 'degraded';
  }
  if (Array.isArray(source.railway)) result.railway = sanitizeRailwayEvidence(source.railway);
  if (result.reports) result.diagnoses = result.reports.map(r => inspectChain(r,result.railway ?? []));
  const optimizer = sanitizeOptimizer(source.optimizer);
  if (optimizer) result.optimizer = optimizer;
  if (status === 'degraded' && typeof source.error === 'string') {
    result.error = SAFE_ERRORS.has(source.error as NonNullable<WatchdogStatus['error']>)
      ? source.error as NonNullable<WatchdogStatus['error']>
      : 'WATCHDOG_FAILED';
  }
  return result;
}

export function createWatchdogStatusStore(database: WatchdogStatusDatabase) {
  return {
    async load(): Promise<WatchdogStatus | null> {
      try {
        const { items } = await database.list<WatchdogStatus>(TABLE, { limit: 1 });
        return items.length > 0 ? sanitizeWatchdogStatus(items[0]) : null;
      } catch {
        throw new Error('WATCHDOG_STATUS_READ_FAILED');
      }
    },

    async save(value: unknown): Promise<WatchdogStatus> {
      const status = sanitizeWatchdogStatus(value);
      delete status.optimizer;
      try {
        const { items } = await database.list<WatchdogStatus>(TABLE, { limit: 1 });
        const id = items[0]?.id;
        if (typeof id === 'string' && id) {
          const updated = await database.update(TABLE, [{ id, record: status }]);
          if (!updated[0]) throw new Error('UPDATE_FAILED');
        } else {
          const added = await database.add(TABLE, [status]);
          if (!added[0]) throw new Error('ADD_FAILED');
        }
        return status;
      } catch {
        throw new Error('WATCHDOG_STATUS_WRITE_FAILED');
      }
    },
  };
}

// Old records retain their conservative 18-minute limit until a new run supplies
// a calendar-derived checkpoint. Both the API and panel use this same verdict.
export function watchdogFreshness(value: WatchdogStatus, now: Date): 'fresh' | 'stale' | 'invalid' {
  const completed = Date.parse(value.completedAt);
  const current = now.getTime();
  if (!Number.isFinite(completed) || !Number.isFinite(current) || completed > current + 120000) return 'invalid';
  const status = sanitizeWatchdogStatus(value);
  const next = status.nextCheckAt ? Date.parse(status.nextCheckAt) : NaN;
  const deadline = Math.max(completed + 18 * 60000, Number.isFinite(next) ? next + 8 * 60000 : 0);
  return current > deadline ? 'stale' : 'fresh';
}
