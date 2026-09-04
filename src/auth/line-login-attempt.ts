const LINE_LOGIN_ATTEMPT_KEY = 'matrix-line-login-pending';

export const LINE_LOGIN_ATTEMPT_TTL_MS = 10 * 60 * 1_000;

type AttemptStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

type ConsumeLineLoginAttemptOptions = {
  hasSession: boolean;
  callbackUrl?: string;
  now?: number;
  storage?: AttemptStorage;
};

function hasOAuthCallbackError(callbackUrl: string): boolean {
  try {
    const url = new URL(callbackUrl, window.location.origin);
    const hash = new URLSearchParams(url.hash.startsWith('#') ? url.hash.slice(1) : url.hash);
    return url.searchParams.has('error')
      || url.searchParams.has('error_code')
      || hash.has('error')
      || hash.has('error_code');
  } catch {
    return true;
  }
}

export function markLineLoginAttempt(
  storage?: AttemptStorage,
  startedAt = Date.now(),
) {
  try {
    (storage ?? window.sessionStorage).setItem(
      LINE_LOGIN_ATTEMPT_KEY,
      JSON.stringify({ startedAt }),
    );
  } catch {
    // OAuth can continue when session storage is unavailable.
  }
}

export function clearLineLoginAttempt(storage?: AttemptStorage) {
  try {
    (storage ?? window.sessionStorage).removeItem(LINE_LOGIN_ATTEMPT_KEY);
  } catch {
    // Nothing can be cleared when session storage is unavailable.
  }
}

export function consumeLineLoginAttempt({
  hasSession,
  callbackUrl = window.location.href,
  now = Date.now(),
  storage,
}: ConsumeLineLoginAttemptOptions): boolean {
  try {
    const attemptStorage = storage ?? window.sessionStorage;
    const rawAttempt = attemptStorage.getItem(LINE_LOGIN_ATTEMPT_KEY);
    if (rawAttempt === null) return false;

    let attempt: unknown;
    try {
      attempt = JSON.parse(rawAttempt);
    } catch {
      attemptStorage.removeItem(LINE_LOGIN_ATTEMPT_KEY);
      return false;
    }

    const keys = attempt && typeof attempt === 'object' ? Object.keys(attempt) : [];
    const startedAt = attempt && typeof attempt === 'object'
      ? (attempt as { startedAt?: unknown }).startedAt
      : null;
    const age = typeof startedAt === 'number' ? now - startedAt : Number.NaN;
    const isValid = keys.length === 1
      && keys[0] === 'startedAt'
      && Number.isFinite(startedAt)
      && age >= 0
      && age < LINE_LOGIN_ATTEMPT_TTL_MS;

    if (!isValid || hasOAuthCallbackError(callbackUrl)) {
      attemptStorage.removeItem(LINE_LOGIN_ATTEMPT_KEY);
      return false;
    }
    if (!hasSession) return false;

    attemptStorage.removeItem(LINE_LOGIN_ATTEMPT_KEY);
    return true;
  } catch {
    return false;
  }
}
