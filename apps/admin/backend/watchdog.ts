export type WatchdogLottery = '今彩539' | '天天樂' | '六合彩' | '大樂透';

export type WatchdogSnapshot = {
  lottery: WatchdogLottery;
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
  };
};

export type WatchdogAction = {
  lottery: WatchdogLottery;
  target: 'github' | 'railway';
  reasons: string[];
};

type SupabaseReader = {
  selectRows<T = unknown>(table: string, query: string): Promise<T[]>;
};

type SecretReader = {
  listSecretNames(): Promise<string[]>;
  readSecret(name: string): Promise<unknown>;
};

const LOTTERIES: WatchdogLottery[] = ['今彩539', '天天樂', '六合彩', '大樂透'];
const JOB_NAME: Record<WatchdogLottery, string> = {
  今彩539: 'matrix-539-refresh-v2',
  天天樂: 'matrix-fantasy5-refresh-v2',
  六合彩: 'matrix-marksix-refresh-v2',
  大樂透: 'matrix-649-refresh-v2',
};
const ANALYSIS_VERSION = 'matrix-python-v12';
const JOB_STALE_MS = 20 * 60 * 1000;
const ANALYSIS_STALE_MS = 45 * 60 * 1000;
const FINAL_RETRY_MINUTES = 345;
const PRE_CALL_MINUTES = [-120, -60, -30];

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

function isDrawDay(lottery: WatchdogLottery, day: LocalDay): boolean {
  const value = weekday(day);
  if (lottery === '今彩539') return value >= 1 && value <= 6;
  if (lottery === '大樂透') return value === 2 || value === 5;
  return true;
}

function callClock(lottery: WatchdogLottery, day: LocalDay): [number, number] {
  if (lottery === '今彩539') return [20, 33];
  if (lottery === '大樂透') return [20, 53];
  if (lottery === '六合彩') return [21, 33];
  const summer = day.month > 3
    || day.month === 3 && day.day >= 13
    ? day.month < 11 || day.month === 11 && day.day <= 5
    : false;
  return summer ? [9, 33] : [10, 33];
}

function taipeiInstant(day: LocalDay, hour: number, minute: number): number {
  return Date.UTC(day.year, day.month - 1, day.day, hour - 8, minute);
}

function previousDrawDay(lottery: WatchdogLottery, day: LocalDay): LocalDay {
  for (let offset = 1; offset <= 8; offset += 1) {
    const candidate = addDays(day, -offset);
    if (isDrawDay(lottery, candidate)) return candidate;
  }
  throw new Error('PREVIOUS_DRAW_DAY_NOT_FOUND');
}

function dateText(day: LocalDay): string {
  return `${String(day.year).padStart(4, '0')}-${String(day.month).padStart(2, '0')}-${String(day.day).padStart(2, '0')}`;
}

function expectedDrawDateDuringCallWindow(
  lottery: WatchdogLottery,
  now: Date,
): string | null {
  const local = taipeiParts(now);
  const currentMinute = Math.floor(now.getTime() / 60_000) * 60_000;
  for (const offset of [-1, 0, 1]) {
    const cycleDay = addDays(local, offset);
    if (!isDrawDay(lottery, cycleDay)) continue;
    const [hour, minute] = callClock(lottery, cycleDay);
    const base = taipeiInstant(cycleDay, hour, minute);
    const isPreCall = PRE_CALL_MINUTES.some(
      (minutes) => currentMinute === base + minutes * 60_000,
    );
    const isRetryWindow = currentMinute >= base
      && currentMinute <= base + FINAL_RETRY_MINUTES * 60_000;
    if (!isPreCall && !isRetryWindow) continue;
    const targetDay = isPreCall ? previousDrawDay(lottery, cycleDay) : cycleDay;
    return dateText(lottery === '天天樂' ? addDays(targetDay, -1) : targetDay);
  }
  return null;
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
    const crawlerTarget = snapshot.lottery === '天天樂' ? 'github' : 'railway';
    if (snapshot.job?.status === 'failed') {
      add(snapshot.lottery, crawlerTarget, 'job-failed');
    } else if (
      snapshot.job?.status === 'running'
      && isOlderThan(snapshot.job.updatedAt ?? snapshot.job.startedAt, now, JOB_STALE_MS)
    ) {
      add(snapshot.lottery, crawlerTarget, 'job-stuck');
    }

    const expectedDate = expectedDrawDateDuringCallWindow(snapshot.lottery, now);
    if (expectedDate && snapshot.latestDraw?.drawDate !== expectedDate) {
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
      && isOlderThan(analysis.startedAt, now, ANALYSIS_STALE_MS)
    ) {
      add(snapshot.lottery, 'railway', 'analysis-stuck');
    }
  }
  return [...planned.values()];
}

const encode = (value: string) => encodeURIComponent(value);
const nullableString = (value: unknown): string | null =>
  typeof value === 'string' ? value : null;

export function createSupabaseWatchdogSnapshotLoader(supabase: SupabaseReader) {
  return async (): Promise<WatchdogSnapshot[]> => Promise.all(LOTTERIES.map(async (lottery) => {
    const [jobRows, drawRows] = await Promise.all([
      supabase.selectRows<Record<string, unknown>>(
        'system_job_status',
        `select=status,started_at,updated_at&job_name=eq.${encode(JOB_NAME[lottery])}&limit=1`,
      ),
      supabase.selectRows<Record<string, unknown>>(
        'lottery_draws',
        `select=period,draw_date&lottery=eq.${encode(lottery)}&order=draw_date.desc.nullslast,period.desc&limit=1`,
      ),
    ]);
    const jobRow = jobRows[0];
    const drawRow = drawRows[0];
    const period = nullableString(drawRow?.period);
    const analysisRows = period ? await supabase.selectRows<Record<string, unknown>>(
      'matrix_analysis_runs',
      `select=draw_period,status,started_at&lottery=eq.${encode(lottery)}&draw_period=eq.${encode(period)}&analysis_version=eq.${encode(`${period}:${ANALYSIS_VERSION}`)}&limit=1`,
    ) : [];
    const analysisRow = analysisRows[0];
    const jobStatus = nullableString(jobRow?.status);
    const analysisStatus = nullableString(analysisRow?.status);
    return {
      lottery,
      job: jobStatus ? {
        status: jobStatus as WatchdogSnapshot['job'] extends { status: infer T } ? T : never,
        startedAt: nullableString(jobRow?.started_at),
        updatedAt: nullableString(jobRow?.updated_at),
      } : null,
      latestDraw: period ? {
        period,
        drawDate: nullableString(drawRow?.draw_date),
      } : null,
      latestAnalysis: analysisStatus ? {
        drawPeriod: nullableString(analysisRow?.draw_period) ?? '',
        status: analysisStatus as WatchdogSnapshot['latestAnalysis'] extends { status: infer T } ? T : never,
        startedAt: nullableString(analysisRow?.started_at),
      } : null,
    };
  }));
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
      const runsResponse = await fetcher(`${workflowUrl}/runs?per_page=10`, {
        cache: 'no-store',
        redirect: 'error',
        headers,
      });
      if (!runsResponse.ok) return 'failed';
      const payload = await runsResponse.json() as { workflow_runs?: Array<{ status?: string }> };
      if ((payload.workflow_runs ?? []).some((run) =>
        ['queued', 'in_progress', 'requested', 'waiting', 'pending'].includes(String(run.status)))) {
        return 'already-running';
      }
      const dispatchResponse = await fetcher(`${workflowUrl}/dispatches`, {
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
  loadSnapshot: () => Promise<WatchdogSnapshot[]>;
  recoverRailway: (lottery: WatchdogLottery) => Promise<unknown>;
  dispatchFantasy5: () => Promise<string>;
};

export function createIndependentWatchdog(dependencies: WatchdogDependencies) {
  return {
    async run(at: Date = new Date()) {
      let snapshots: WatchdogSnapshot[];
      try {
        snapshots = await dependencies.loadSnapshot();
      } catch {
        return { status: 'degraded', checkedAt: at.toISOString(), actions: [], error: 'STATUS_UNAVAILABLE' };
      }
      const actions = planWatchdogActions(snapshots, at);
      const results = await Promise.all(actions.map(async (action) => {
        try {
          const outcome = action.target === 'github'
            ? await dependencies.dispatchFantasy5()
            : await dependencies.recoverRailway(action.lottery).then(() => 'accepted');
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
        actions: results,
      };
    },
  };
}

