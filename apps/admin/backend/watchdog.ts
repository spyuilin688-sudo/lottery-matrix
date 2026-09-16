export type WatchdogLottery = '今彩539' | '天天樂' | '六合彩' | '大樂透';

export type WatchdogSnapshot = {
  lottery: WatchdogLottery;
  drawDays?: string[];
  job: null | {
    status: 'running' | 'waiting_source' | 'success' | 'failed';
    startedAt: string | null;
    updatedAt: string | null;
  };
  latestDraw: null | { period: string; drawDate: string | null };
  latestAnalysis: null | {
    drawPeriod: string;
    status: 'running' | 'complete' | 'failed';
    startedAt: string | null;
    updatedAt: string | null;
    leaseExpiresAt: string | null;
  };
};

export type WatchdogAction = {
  lottery: WatchdogLottery;
  target: 'github' | 'railway';
  reasons: string[];
};

type SupabaseReader = {
  supabaseRequest<T = unknown>(path: string, init?: RequestInit): Promise<T>;
};

type SecretReader = {
  listSecretNames(): Promise<string[]>;
  readSecret(name: string): Promise<unknown>;
};

const LOTTERIES: WatchdogLottery[] = ['今彩539', '天天樂', '六合彩', '大樂透'];
const JOB_NAME: Record<WatchdogLottery, string> = {
  今彩539: 'matrix-539-refresh-v2',
  天天樂: 'matrix-fantasy5-refresh-v2',
  六合: 'matrix-marksix-refresh-v2',
  大樂透: 'matrix-649-refresh-v2',
};
const JOB_STALE_MS = 20 * 60 * 1000;
const ANALYSIS_STALE_MS = 45 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 8_000;
const RECOVERY_LEASE_SECONDS = 20 * 60;
const PHYSICAL_TICK_MINUTES = 10;
const WATCHDOG_PHASES = [
  { first: 10, last: 90, every: 10 },
  { first: 120, last: 300, every: 30 },
  { first: 360, last: 1_380, every: 60 },
  { first: 1_410, last: 1_410, every: 30 },
] as const;
const MARKSIX_SATURDAY_RECOVERY_LIMIT_MINUTES = 90;

export function buildWatchdogPhasePlan(): number[] {
  return WATCHDOG_PHASES.flatMap(({ first, last, every }) => {
    const checkpoints: number[] = [];
    for (let minute = first; minute <= last; minute += every) checkpoints.push(minute);
    return checkpoints;
  });
}

const WATCHDOG_CHECKPOINT_MINUTES = buildWatchdogPhasePlan();

type LocalDay = { year: number; month: number; day: number };

function taipeiParts(value: Date): LocalDay & { hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(value);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour'),
    minute: get('minute'),
  };
}

function addDays(day: LocalDay, offset: number): LocalDay {
  const value = new Date(Date.UTC(day.year, day.month - 1, day.day + offset));
  return {
    year: value.getUTCFullYear(),
    month: value.getUTCMonth() + 1,
    day: value.getUTCDate(),
  };
}

function weekday(day: LocalDay): number {
  return new Date(Date.UTC(day.year, day.month - 1, day.day)).getUTCDay();
}

function dateText(day: LocalDay): string {
  return `${String(day.year).padStart(4, '0')}-${String(day.month).padStart(2, '0')}-${String(day.day).padStart(2, '0')}`;
}

// Compatibility only for direct pure-function callers/tests that do not load a
// production snapshot. Production snapshots always carry drawDays from the
// canonical Supabase resolver and never use this fallback.
function legacyDrawDayFallback(lottery: WatchdogLottery, day: LocalDay): boolean {
  const value = weekday(day);
  if (lottery === '今彩539') return value >= 1 && value <= 6;
  if (lottery === '大樂透') return value === 2 || value === 5;
  if (lottery === '六合彩') return value === 2 || value === 4 || value === 6;
  return true;
}

function isConfiguredDrawDay(
  lottery: WatchdogLottery,
  day: LocalDay,
  drawDays?: readonly string[],
): boolean {
  if (drawDays !== undefined) return drawDays.includes(dateText(day));
  return legacyDrawDayFallback(lottery, day);
}

function isRecoveryCycleDay(
  lottery: WatchdogLottery,
  day: LocalDay,
  drawDays?: readonly string[],
): boolean {
  return (
    isConfiguredDrawDay(lottery, day, drawDays)
    || (
      lottery === '六合彩'
      && weekday(day) === 0
      && isConfiguredDrawDay(lottery, addDays(day, -1), drawDays)
    )
  );
}

function checkpointAllowed(
  lottery: WatchdogLottery,
  cycleDay: LocalDay,
  checkpoint: number,
): boolean {
  return !(
    lottery === '六合彩'
    && weekday(cycleDay) === 6
    && checkpoint > MARKSIX_SATURDAY_RECOVERY_LIMIT_MINUTES
  );
}

function zonedParts(value: Date, timeZone: string): LocalDay & { hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(value);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour'),
    minute: get('minute'),
  };
}

function callClock(lottery: WatchdogLottery, day: LocalDay): [number, number] {
  if (lottery === '今彩539') return [20, 33];
  if (lottery === '大樂透') return [20, 53];
  if (lottery === '六合彩') return [21, 33];
  const sourceDay = addDays(day, -1);
  for (const hour of [9, 10]) {
    const candidate = new Date(taipeiInstant(day, hour, 33));
    const california = zonedParts(candidate, 'America/Los_Angeles');
    if (
      california.year === sourceDay.year
      && california.month === sourceDay.month
      && california.day === sourceDay.day
      && california.hour === 18
      && california.minute === 33
    ) return [hour, 33];
  }
  throw new Error('FANTASY5_CALL_CLOCK_NOT_FOUND');
}

function taipeiInstant(day: LocalDay, hour: number, minute: number): number {
  return Date.UTC(day.year, day.month - 1, day.day, hour - 8, minute);
}

function nextPrimaryInstant(
  lottery: WatchdogLottery,
  cycleDay: LocalDay,
  drawDays?: readonly string[],
): number {
  for (let offset = 1; offset <= 9; offset += 1) {
    const day = addDays(cycleDay, offset);
    if (!isConfiguredDrawDay(lottery, day, drawDays)) continue;
    const [hour, minute] = callClock(lottery, day);
    return taipeiInstant(day, hour, minute);
  }
  return Number.POSITIVE_INFINITY;
}

export function expectedDrawDateForDueWindow(
  lottery: WatchdogLottery,
  now: Date,
  drawDays?: readonly string[],
): string | null {
  const local = taipeiParts(now);
  const currentMinute = Math.floor(now.getTime() / 60_000) * 60_000;
  const previousTick = currentMinute - PHYSICAL_TICK_MINUTES * 60_000;
  for (const offset of [0, -1]) {
    const cycleDay = addDays(local, offset);
    if (!isRecoveryCycleDay(lottery, cycleDay, drawDays)) continue;
    const [hour, minute] = callClock(lottery, cycleDay);
    const base = taipeiInstant(cycleDay, hour, minute);
    const nextPrimary = nextPrimaryInstant(lottery, cycleDay, drawDays);
    const hasDueCheckpoint = WATCHDOG_CHECKPOINT_MINUTES.some((checkpoint) => {
      if (!checkpointAllowed(lottery, cycleDay, checkpoint)) return false;
      const dueAt = base + checkpoint * 60_000;
      return (
        dueAt < nextPrimary
        && dueAt > previousTick
        && dueAt <= currentMinute
      );
    });
    if (hasDueCheckpoint) return dateText(cycleDay);
  }
  return null;
}

function minimumExpectedDrawDate(lottery: WatchdogLottery, expectedDate: string): string {
  if (lottery !== '六合彩') return expectedDate;
  const [year, month, day] = expectedDate.split('-').map(Number);
  const cycleDay = { year, month, day };
  return weekday(cycleDay) === 0 ? dateText(addDays(cycleDay, -1)) : expectedDate;
}

function isOlderThan(value: string | null | undefined, now: Date, ageMs: number): boolean {
  if (!value) return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && now.getTime() - timestamp > ageMs;
}

export function planWatchdogActions(
  snapshots: WatchdogSnapshot[],
  now: Date,
): WatchdogAction[] {
  const planned = new Map<string, WatchdogAction>();
  const add = (lottery: WatchdogLottery, target: WatchdogAction['target'], reason: string) => {
    const key = `${lottery}:${target}`;
    const action = planned.get(key) ?? { lottery, target, reasons: [] };
    if (!action.reasons.includes(reason)) action.reasons.push(reason);
    planned.set(key, action);
  };

  for (const snapshot of snapshots) {
    const expectedDate = expectedDrawDateForDueWindow(
      snapshot.lottery,
      now,
      snapshot.drawDays,
    );
    if (!expectedDate) continue;
    const crawlerTarget = snapshot.lottery === '天天樂' ? 'github' : 'railway';
    const drawDate = snapshot.latestDraw?.drawDate;
    const minimumDrawDate = minimumExpectedDrawDate(snapshot.lottery, expectedDate);
    const staleDraw = (
      !drawDate
      || !/^\d{4}-\d{2}-\d{2}$/.test(drawDate)
      || drawDate < minimumDrawDate
    );
    if (staleDraw) {
      const jobHeartbeat = snapshot.job?.updatedAt ?? snapshot.job?.startedAt;
      const crawlerIsRunning = (
        snapshot.job?.status === 'running'
        && Boolean(jobHeartbeat)
        && !isOlderThan(jobHeartbeat, now, JOB_STALE_MS)
      );
      if (crawlerIsRunning) continue;
      if (snapshot.job?.status === 'failed') {
        add(snapshot.lottery, crawlerTarget, 'job-failed');
      } else if (
        snapshot.job?.status === 'running'
        && isOlderThan(snapshot.job.updatedAt ?? snapshot.job.startedAt, now, JOB_STALE_MS)
      ) {
        add(snapshot.lottery, crawlerTarget, 'job-stuck');
      }
      add(snapshot.lottery, crawlerTarget, 'crawler-stale');
    }

    if (!snapshot.latestDraw) continue;
    const analysis = snapshot.latestAnalysis;
    if (!analysis || analysis.drawPeriod !== snapshot.latestDraw.period) {
      add(snapshot.lottery, 'railway', 'analysis-missing');
    } else if (analysis.status === 'failed') {
      add(snapshot.lottery, 'railway', 'analysis-failed');
    } else if (
      analysis.status === 'running'
      && !(analysis.leaseExpiresAt && Date.parse(analysis.leaseExpiresAt) > now.getTime())
      && isOlderThan(analysis.updatedAt ?? analysis.startedAt, now, ANALYSIS_STALE_MS)
    ) {
      add(snapshot.lottery, 'railway', 'analysis-stuck');
    }
  }
  return [...planned.values()];
}

const encode = (value: string) => encodeURIComponent(value);
const nullableString = (value: unknown): string | null =>
  typeof value === 'string' ? value : null;

async function supabaseRequest<T>(
  supabase: SupabaseReader,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error('REQUEST_TIMEOUT'));
    }, REQUEST_TIMEOUT_MS);
  });
  try {
    return await Promise.race([
      supabase.supabaseRequest<T>(path, { ...init, signal: controller.signal }),
      timeout,
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

async function fetchWithTimeout(
  fetcher: typeof fetch,
  input: RequestInfo | URL,
  init: RequestInit,
): Promise<Response> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error('REQUEST_TIMEOUT'));
    }, REQUEST_TIMEOUT_MS);
  });
  try {
    return await Promise.race([
      fetcher(input, { ...init, signal: controller.signal }),
      timeout,
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

async function fetchJsonWithTimeout<T>(
  fetcher: typeof fetch,
  input: RequestInfo | URL,
  init: RequestInit,
): Promise<{ response: Response; payload: T | null }> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error('REQUEST_TIMEOUT'));
    }, REQUEST_TIMEOUT_MS);
  });
  const work = (async () => {
    const response = await fetcher(input, { ...init, signal: controller.signal });
    const payload = response.ok ? await response.json() as T : null;
    return { response, payload };
  })();
  try {
    return await Promise.race([work, timeout]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

function drawDayRange(at: Date): { start: string; end: string } {
  const local = taipeiParts(at);
  return {
    start: dateText(addDays(local, -1)),
    end: dateText(addDays(local, 9)),
  };
}

function calendarDrawDays(
  calendar: Record<string, unknown>,
  lottery: WatchdogLottery,
): string[] {
  const value = calendar[lottery];
  if (!Array.isArray(value) || value.some((item) =>
    typeof item !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(item))) {
    throw new Error('WATCHDOG_DRAW_DAY_CALENDAR_INVALID');
  }
  return value;
}

export function createSupabaseWatchdogSnapshotLoader(supabase: SupabaseReader) {
  return async (at: Date = new Date()): Promise<WatchdogSnapshot[]> => {
    const range = drawDayRange(at);
    const calendar = await supabaseRequest<Record<string, unknown>>(
      supabase,
      'rpc/matrix_watchdog_draw_days',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          p_start_date: range.start,
          p_end_date: range.end,
        }),
      },
    );

    return Promise.all(LOTTERIES.map(async (lottery) => {
      const [jobRows, drawRows] = await Promise.all([
        supabaseRequest<Record<string, unknown>[]>(supabase,
          `system_job_status?select=status,started_at,updated_at&job_name=eq.${encode(JOB_NAME[lottery])}&limit=1`,
        ),
        supabaseRequest<Record<string, unknown>[]>(supabase,
          `lottery_draws?select=period,draw_date&lottery=eq.${encode(lottery)}&order=draw_date.desc.nullslast,period.desc&limit=1`,
        ),
      ]);
      const jobRow = jobRows[0];
      const drawRow = drawRows[0];
      const period = nullableString(drawRow?.period);
      const analysisState = period ? await supabaseRequest<Record<string, unknown>>(supabase,
        'rpc/matrix_watchdog_analysis_state',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ p_lottery: lottery, p_draw_period: period }),
        },
      ) : null;
      const jobStatus = nullableString(jobRow?.status);
      const analysisStatus = nullableString(analysisState?.status);
      const visibleAnalysisStatus = (
        analysisStatus === 'running'
        || analysisStatus === 'complete'
        || analysisStatus === 'failed'
      ) ? analysisStatus : null;
      return {
        lottery,
        drawDays: calendarDrawDays(calendar, lottery),
        job: jobStatus ? {
          status: jobStatus as WatchdogSnapshot['job'] extends { status: infer T } ? T : never,
          startedAt: nullableString(jobRow?.started_at),
          updatedAt: nullableString(jobRow?.updated_at),
        } : null,
        latestDraw: period ? {
          period,
          drawDate: nullableString(drawRow?.draw_date),
        } : null,
        latestAnalysis: visibleAnalysisStatus ? {
          drawPeriod: nullableString(analysisState?.drawPeriod) ?? '',
          status: visibleAnalysisStatus as WatchdogSnapshot['latestAnalysis'] extends { status: infer T } ? T : never,
          startedAt: nullableString(analysisState?.startedAt),
          updatedAt: nullableString(analysisState?.updatedAt),
          leaseExpiresAt: nullableString(analysisState?.leaseExpiresAt),
        } : null,
      };
    }));
  };
}

export function createSupabaseWatchdogLeaseManager(supabase: SupabaseReader) {
  return {
    async claim(key: string, owner: string): Promise<boolean> {
      return await supabaseRequest<boolean>(supabase, 'rpc/claim_matrix_watchdog_lease', {
        method: 'POST',
        body: JSON.stringify({
          p_lease_key: key,
          p_owner_id: owner,
          p_ttl_seconds: RECOVERY_LEASE_SECONDS,
        }),
      }) === true;
    },
    async release(key: string, owner: string): Promise<void> {
      await supabaseRequest<boolean>(supabase, 'rpc/release_matrix_watchdog_lease', {
        method: 'POST',
        body: JSON.stringify({ p_lease_key: key, p_owner_id: owner }),
      });
    },
  };
}

export async function getGithubActionsToken(reader: SecretReader): Promise<string | null> {
  try {
    const names = await reader.listSecretNames();
    if (!names.includes('GITHUB_ACTIONS_TOKEN')) return null;
    const token = String(await reader.readSecret('GITHUB_ACTIONS_TOKEN') ?? '').trim();
    return token || null;
  } catch {
    return null;
  }
}

export function createFantasy5GithubDispatcher(
  loadToken: () => Promise<string | null>,
  fetcher: typeof fetch = fetch,
) {
  const workflowUrl = 'https://api.github.com/repos/spyuilin688-sudo/lottery-matrix/actions/workflows/fantasy5-crawler.yml';
  return async (): Promise<'dispatched' | 'already-running' | 'config-missing' | 'failed'> => {
    const token = await loadToken();
    if (!token) return 'config-missing';
    const headers = {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
    };
    try {
      const { response: runsResponse, payload } = await fetchJsonWithTimeout<{
        workflow_runs?: Array<{ status?: string }>;
      }>(fetcher, `${workflowUrl}/runs?per_page=10`, {
        cache: 'no-store',
        redirect: 'error',
        headers,
      });
      if (!runsResponse.ok) return 'failed';
      if ((payload?.workflow_runs ?? []).some((run) =>
        ['queued', 'in_progress', 'requested', 'waiting', 'pending'].includes(String(run.status)))) {
        return 'already-running';
      }
      const dispatchResponse = await fetchWithTimeout(fetcher, `${workflowUrl}/dispatches`, {
        method: 'POST',
        cache: 'no-store',
        redirect: 'error',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ref: 'main' }),
      });
      return dispatchResponse.status === 204 ? 'dispatched' : 'failed';
    } catch {
      return 'failed';
    }
  };
}

type WatchdogDependencies = {
  loadSnapshot: (at?: Date) => Promise<WatchdogSnapshot[]>;
  claimLease: (key: string, owner: string) => Promise<boolean>;
  releaseLease: (key: string, owner: string) => Promise<void>;
  recoverRailway: (lottery: WatchdogLottery, leaseOwner: string) => Promise<unknown>;
  dispatchFantasy5: () => Promise<string>;
};

export function createIndependentWatchdog(dependencies: WatchdogDependencies) {
  return {
    async run(at: Date = new Date(), owner = crypto.randomUUID()) {
      let snapshots: WatchdogSnapshot[];
      try {
        snapshots = await dependencies.loadSnapshot(at);
      } catch {
        return {
          status: 'degraded',
          checkedAt: at.toISOString(),
          dueLotteries: [],
          actions: [],
          error: 'STATUS_UNAVAILABLE',
        };
      }
      const dueLotteries = snapshots
        .filter((snapshot) => expectedDrawDateForDueWindow(
          snapshot.lottery,
          at,
          snapshot.drawDays,
        ) !== null)
        .map((snapshot) => snapshot.lottery);
      const actions = planWatchdogActions(snapshots, at);
      const results = await Promise.all(actions.map(async (action) => {
        const leaseKey = `${action.target}:${action.lottery}`;
        let acquired = false;
        try {
          acquired = await dependencies.claimLease(leaseKey, owner);
          if (!acquired) return { ...action, outcome: 'lease-held' };
          let outcome: string;
          if (action.target === 'github') {
            try {
              outcome = await dependencies.dispatchFantasy5();
            } finally {
              await dependencies.releaseLease(leaseKey, owner).catch(() => undefined);
            }
          } else {
            const response = await dependencies.recoverRailway(action.lottery, owner) as { status?: unknown };
            outcome = response?.status === 'already-running' ? 'already-running' : 'accepted';
          }
          return { ...action, outcome };
        } catch {
          return { ...action, outcome: 'failed' };
        }
      }));
      const degraded = results.some((result) =>
        result.outcome === 'failed' || result.outcome === 'config-missing');
      return {
        status: degraded ? 'degraded' : 'ok',
        checkedAt: at.toISOString(),
        dueLotteries,
        actions: results,
      };
    },
  };
}
