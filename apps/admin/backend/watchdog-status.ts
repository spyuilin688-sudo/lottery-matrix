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
  observation?: { checkedAt: string; status: 'ok' | 'degraded'; source: 'read-only-chain' };
  reports?: ChainReport[];
  recoveryReports?: ChainReport[];
  diagnoses?: Diagnosis[];
  railway?: RailwayEvidence[];
  optimizer?: OptimizerReport;
  schedule?: { checkedAt: string; due: boolean; pendingSince: string | null; nextCheckAt?: string };
  checkedAt: string;
  completedAt: string;
  dueLotteries: WatchdogStatusAction['lottery'][];
  actions: WatchdogStatusAction[];
  error?: 'STATUS_UNAVAILABLE' | 'WATCHDOG_FAILED' | 'WATCHDOG_STATUS_WRITE_FAILED';
};

// Share the same freshness decision between the API and the retained-report UI.
export function watchdogObservation(status: WatchdogStatus, now: Date): 'fresh' | 'idle' | 'pending' | 'stale' | 'invalid' {
  const age = (value: string) => now.getTime() - Date.parse(value);
  const valid = (value: string) => Number.isFinite(age(value)) && age(value) >= -120_000;
  if (!valid(status.completedAt)) return 'invalid';
  const schedule = status.schedule;
  if (schedule) {
    if (!valid(schedule.checkedAt) || (schedule.pendingSince !== null && !valid(schedule.pendingSince))) return 'invalid';
    if (schedule.nextCheckAt !== undefined) {
      const next = Date.parse(schedule.nextCheckAt);
      if (!Number.isFinite(next) || next <= Date.parse(schedule.checkedAt)) return 'invalid';
      if (schedule.pendingSince !== null) return age(schedule.pendingSince) > 18 * 60_000 ? 'stale' : 'pending';
      return now.getTime() > next + 18*60_000 ? 'stale' : 'idle';
    }
    if (age(schedule.checkedAt) > 18 * 60_000) return 'stale';
    if (schedule.pendingSince !== null) return age(schedule.pendingSince) > 18 * 60_000 ? 'stale' : 'pending';
    if (!schedule.due) return 'idle';
  }
  return age(status.completedAt) > 18 * 60_000 ? 'stale' : 'fresh';
}

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
  if (isRow(source.schedule) && typeof source.schedule.due === 'boolean'
    && typeof source.schedule.checkedAt === 'string' && Number.isFinite(Date.parse(source.schedule.checkedAt))
    && (source.schedule.pendingSince === null || (typeof source.schedule.pendingSince === 'string' && Number.isFinite(Date.parse(source.schedule.pendingSince))))) {
    result.schedule = { checkedAt: source.schedule.checkedAt, due: source.schedule.due, pendingSince: source.schedule.pendingSince as string | null, ...(typeof source.schedule.nextCheckAt === 'string' ? {nextCheckAt:source.schedule.nextCheckAt} : {}) };
  }
  if (Array.isArray(source.recoveryReports)) {
    result.recoveryReports = sanitizeChainReports(source.recoveryReports);
    if (result.recoveryReports.some(r => r.state !== 'PASS')) result.status = 'degraded';
  }
  if (Array.isArray(source.reports)) {
    result.reports = sanitizeChainReports(source.reports);
    if (result.reports.length !== 4 || result.reports.some(r => r.state !== 'PASS')) result.status = 'degraded';
  }
  if (isRow(source.observation) && source.observation.source === 'read-only-chain'
    && typeof source.observation.checkedAt === 'string'
    && ['ok', 'degraded'].includes(String(source.observation.status))) {
    const observedTime = Date.parse(source.observation.checkedAt);
    if (Number.isFinite(observedTime) && observedTime >= Date.parse(result.completedAt)
      && result.reports?.length === 4 && result.reports.every(report =>
        Date.parse(report.checkedAt) === observedTime
        && report.stages.every(stage => Date.parse(stage.observedAt) === observedTime))) {
      result.observation = { checkedAt: new Date(observedTime).toISOString(), source: 'read-only-chain',
        status: source.observation.status === 'ok' && result.reports.every(report => report.state === 'PASS') ? 'ok' : 'degraded' };
    }
  }
  if (Array.isArray(source.railway)) result.railway = sanitizeRailwayEvidence(source.railway);
  // A request observation refreshes database chains only. Retain the previous
  // Railway evidence, but do not present it as part of the current diagnosis.
  if (result.reports) result.diagnoses = result.reports.map(r => inspectChain(r,result.observation ? [] : result.railway ?? []));
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
      delete status.observation; // Request evidence must never become a scheduler heartbeat.
      delete status.optimizer;
      delete status.schedule; // Cron evidence is owned by the database, never by a report writer.
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
