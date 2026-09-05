# Mobile PWA LINE return after the user's recording

Base: main 07b1a4db4207ef3740f4c7c02b0e53578f39a4b0 (PR #331).

## Evidence and correction

The supplied Android recording shows a blank authorization window, a return to
the pending PWA, then a full Chrome tab containing the logged-in Matrix homepage.
Hardware Back reveals the original PWA and its login-success dialog. PR #331's
popup mechanism did not solve that mobile native-login path.

Use the existing same-window Supabase OAuth navigation on installed Android,
iPhone and iPad PWAs, passing LINE's `disable_auto_login=true`. This prevents the
automatic native LINE app jump that can split the navigation into a new Chrome
tab. Keep desktop controlled popups and regular-browser native login unchanged.
Keep the current origin-root redirect, provider scopes, PKCE and callback URL.

LINE web SSO shows a continuation confirmation when its cookie exists. Otherwise
LINE displays its login page, so first-time login can require credentials. This
is a deliberate mobile login tradeoff, not a JavaScript command to close an
arbitrary browser or an OS Back-button workaround.

## Verification

- RED: Android fullscreen, iPhone home-screen and iPad desktop-UA cases each
  reproduced the unwanted `window.open('about:blank', ...)`.
- GREEN: all 109 related auth, profile and PWA tests passed, including ordinary
  Android browser behavior and the existing desktop-popup regression.
- Production authorize URL A/B: control HTTP 302 omitted `disable_auto_login`;
  mobile HTTP 302 included `disable_auto_login=true`. Both pointed to LINE's
  authorize endpoint and retained S256 plus the existing Supabase callback.
  No account login was completed; temporary Auth flow state may be created by
  requesting an authorization URL. No provider configuration was changed.
- Independent review confirmed SDK query forwarding, provider parameter handling
  and the documented in-scope PWA return behavior.
- The supplied recording is evidence of the old failure, not a successful test
  of this patch. The updated flow still needs confirmation on the same phone.

## Primary references

- https://developers.line.biz/en/docs/line-login/integrate-line-login/
- https://web.dev/learn/pwa/windows/
- Supabase auth-js 2.112.3 `_getUrlForProvider` and `_handleProviderSignIn`.
- Supabase Auth `internal/api/external.go` and `provider/custom_oauth.go`.
