/** Capture before the Auth SDK consumes the callback and clears its fragment. */
export function isPasswordRecoveryUrl(url: URL): boolean {
  return url.pathname.replace(/\/$/, '') === '/reset-password'
    || new URLSearchParams(url.hash.slice(1)).get('type') === 'recovery';
}
