export type LineLoginCallbackError = 'expired' | 'cancelled' | 'failed';

const ERROR_KEYS = ['error', 'error_code', 'error_description', 'error_uri'];

/** Capture before Supabase initialization can consume or rewrite the callback. */
export function readLineLoginCallbackError(url: URL): LineLoginCallbackError | undefined {
  const sources = [url.searchParams, new URLSearchParams(url.hash.slice(1))];
  const errors = sources.filter((params) => params.has('error') || params.has('error_code'));
  if (errors.length === 0) return undefined;
  if (errors.some((params) => params.get('error_code') === 'bad_oauth_state'
    && params.get('error_description') === 'OAuth state has expired')) return 'expired';
  if (errors.some((params) => params.get('error') === 'access_denied')) return 'cancelled';
  return 'failed';
}

/** Only remove error fields after the callback has finished any PWA handoff. */
export function clearLineLoginCallbackError(browser: Window = window) {
  const url = new URL(browser.location.href);
  for (const key of ERROR_KEYS) url.searchParams.delete(key);
  const hash = new URLSearchParams(url.hash.slice(1));
  if (hash.has('error') || hash.has('error_code')) {
    for (const key of ERROR_KEYS) hash.delete(key);
    url.hash = hash.toString();
  }
  try {
    browser.history.replaceState(browser.history.state, '', url.href);
  } catch {
    // A blocked history update must not prevent the error notice or app startup.
  }
}
