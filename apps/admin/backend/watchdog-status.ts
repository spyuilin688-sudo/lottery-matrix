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
  checkedAt: string;
  completedAt: string;
  dueLotteries: WatchdogStatusAction['lottery'][];
  actions: WatchdogStatusAction[];
  error?: 'STATUS_UNAVAILABLE' | 'WATCHDOG_FAILED' | 'WATCHDOG_STATUS_WRITE_FAILED';
};

const TABLE = 'matrix-watchdog-status';
const LOTTERIES = new Set<WatchdogStatusAction['lottery']>(['今彩539', '天天樂', '六合彩', '大樂透']);
const TARGETS = new Set<WatchdogStatusAction['target']>(['github', 'railway']);
const REASONS = new Set([
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
