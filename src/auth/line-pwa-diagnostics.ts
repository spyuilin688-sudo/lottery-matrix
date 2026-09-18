// Local, bounded diagnostics only. Never persist callback URLs, OAuth values,
// exception messages, or arbitrary worker payload fields.
const STORAGE_KEY = 'matrix-line-pwa-diagnostics-v1';
const MAX_ENTRIES = 40;
const MAX_AGE_MS = 24 * 60 * 60 * 1_000;
const CODES = new Set([
  'CALLBACK_RECEIVED', 'WORKER_READY_TIMEOUT', 'WORKER_READY_FAILED',
  'WORKER_UNAVAILABLE', 'WORKER_REQUEST_POST_FAILED', 'WORKER_RESPONSE_TIMEOUT',
  'WORKER_LEGACY_SUCCESS', 'WORKER_LEGACY_FAILURE', 'WORKER_RESULT_UNKNOWN',
  'CALLBACK_INVALID', 'PWA_LOOKUP_STARTED', 'PWA_CLIENT_STALE',
  'PWA_CLIENT_LOOKUP_FAILED', 'PWA_CLIENT_NOT_FOUND', 'PWA_PROBE_STARTED',
  'PWA_PROBE_TIMEOUT', 'PWA_CLIENT_FOUND', 'PWA_FOCUS_STARTED',
  'PWA_FOCUS_RESOLVED', 'PWA_FOCUS_REJECTED', 'PWA_NAVIGATION_STARTED',
  'PWA_NAVIGATION_REJECTED', 'PWA_NAVIGATION_EMPTY', 'PWA_CALLBACK_POST_FAILED',
  'HANDOFF_DISPATCHED',
]);
const ERROR_NAMES = new Set([
  'InvalidAccessError', 'InvalidStateError', 'SecurityError', 'NotAllowedError',
  'AbortError', 'NotFoundError', 'TypeError', 'Error', 'UnknownError',
]);

type DiagnosticUploadClient = {
  auth: {
    getSession: () => Promise<{
      data: { session: unknown | null };
      error: unknown | null;
    }>;
  };
  rpc: (name: string, params: { p_events: Record<string, unknown>[] }) => PromiseLike<{
    data: unknown;
    error: unknown | null;
  }>;
};

function sanitize(value: Record<string, unknown>) {
  return {
    at: typeof value.at === 'number' && Number.isFinite(value.at) ? value.at : Date.now(),
    requestId: typeof value.requestId === 'string' && /^[a-zA-Z0-9-]{1,80}$/.test(value.requestId)
      ? value.requestId : undefined,
    code: typeof value.code === 'string' && CODES.has(value.code) ? value.code : 'WORKER_RESULT_UNKNOWN',
    errorName: typeof value.errorName === 'string' && ERROR_NAMES.has(value.errorName) ? value.errorName : undefined,
    workerBuild: typeof value.workerBuild === 'string' && /^matrix-pwa-shell-(?:[a-f0-9]{16}|__BUILD_ID__)$/.test(value.workerBuild)
      ? value.workerBuild : undefined,
    elapsedMs: typeof value.elapsedMs === 'number' && Number.isFinite(value.elapsedMs)
      ? Math.max(0, Math.min(value.elapsedMs, 60_000)) : undefined,
    candidateCount: typeof value.candidateCount === 'number' && Number.isInteger(value.candidateCount)
      ? Math.max(0, Math.min(value.candidateCount, 1_000)) : undefined,
  };
}

export function recordLinePwaDiagnostic(browser: Window, requestId: string, details: Record<string, unknown>) {
  try {
    const now = Date.now();
    let previous: unknown = [];
    try { previous = JSON.parse(browser.localStorage.getItem(STORAGE_KEY) ?? '[]'); }
    catch { /* Replace a corrupt diagnostic buffer, without touching auth storage. */ }
    const entries = Array.isArray(previous)
      ? previous.slice(-MAX_ENTRIES).filter((entry) => entry && typeof entry === 'object')
        .map(sanitize).filter((entry) => entry.at <= now && entry.at >= now - MAX_AGE_MS)
      : [];
    entries.push(sanitize({ ...details, requestId, at: now }));
    browser.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(-MAX_ENTRIES)));
  } catch {
    // Storage can be disabled or full. Diagnostics must never block login.
  }
}

export async function flushLinePwaDiagnostics(
  browser: Window = window,
  client: DiagnosticUploadClient,
): Promise<boolean> {
  try {
    const stored = JSON.parse(browser.localStorage.getItem(STORAGE_KEY) ?? '[]');
    if (!Array.isArray(stored)) return false;
    const entries = stored.slice(-MAX_ENTRIES)
      .filter((entry) => entry && typeof entry === 'object')
      .map((entry) => JSON.parse(JSON.stringify(sanitize(entry))))
      .filter((entry) => typeof entry.requestId === 'string');
    if (!entries.length) return false;

    const { data: { session }, error: sessionError } = await client.auth.getSession();
    if (sessionError || !session) return false;
    const { error } = await client.rpc('member_line_pwa_diagnostics_submit', { p_events: entries });
    if (error) return false;
    browser.localStorage.removeItem(STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}
