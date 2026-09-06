# LINE Login operator setup

This guide records the required configuration for the existing API-only LINE
Login integration. It does not create credentials, change Supabase, change
AppDeploy, deploy the PWA, or establish that live LINE Login works.

## 1. Store server-only credentials

In the Supabase Edge Function secret store, configure the server-only secret names
`LINE_CHANNEL_ID` and `LINE_CHANNEL_SECRET`. Keep both out of Git, frontend
build output, browser storage, responses, and logs. Do not place credential
values in this document, source files, tests, or client-side configuration.
The AppDeploy backend does not own LINE revoke and must not load these secrets.

## 2. Configure the Supabase Custom OAuth2 provider

Create or edit the LINE custom provider in Supabase with these exact values:

| Field | Required value |
| --- | --- |
| Provider type | `oauth2` |
| Identifier | `custom:line` |
| Client ID | LINE Channel ID |
| Client secret | LINE Channel secret |
| Authorization URL | `https://access.line.me/oauth2/v2.1/authorize` |
| Token URL | `https://api.line.me/oauth2/v2.1/token` |
| UserInfo URL | `https://api.line.me/oauth2/v2.1/userinfo` |
| Scopes | `openid profile` |
| Email | email optional; do not request the `email` scope |
| PKCE | enabled with `S256` |

Do not add scopes, especially the `email` scope. The scope list is exactly
`openid profile`.

After Supabase displays its callback URL for this provider, copy the exact
callback URL displayed by Supabase into the LINE Console. Never infer,
construct, replace, or otherwise guess that callback URL.

## 3. Allowlist the PWA return URL

In the Supabase redirect allowlist, enter exactly the production normalized
origin root for the PWA: use the actual production deployment's origin root
(the normalized root derived from its `window.location.origin`). The repository
does not authoritatively define that production origin, so obtain it from the
actual production PWA deployment rather than substituting an example value.

The allowlist entry is the root only: no paths, queries, fragments, or external
origins. Do not allow preview, local-development, or third-party return URLs.

The `line-logout` Edge Function CORS allowlist is separately fixed to exactly
`https://matrix-un0kjz.v2.appdeploy.ai` and
`https://matrixlottery.idv.tw`. Unknown browser origins are rejected with
`ORIGIN_NOT_ALLOWED`; an invocation without `Origin` remains available for
server-to-server operation.

## 4. Logout and revoke boundary

The canonical server-side revoke owner is the Supabase Edge Function named
`line-logout`, invoked by the client through
`supabase.functions.invoke('line-logout')`. There is no AppDeploy-compatible
`POST /api/auth/line/logout` route. The Edge Function authenticates the Supabase
bearer, verifies the LINE token's Channel, binds LINE userinfo to the verified
`custom:line` identity, and only then submits LINE revoke. Auth, verify,
userinfo, and revoke each have an independent 5,000 ms deadline and every
network request receives an abort signal.

The LINE provider access token stays only in the current browser page-process memory
long enough to attempt revoke. Provider credentials are stripped from
the persisted Supabase session: specifically, the `provider_token` and
`provider_refresh_token` fields are removed while retaining the Supabase access
token, refresh token, and user needed for session persistence. The Edge Function
handles the submitted provider token only in request memory. Do not store or log
either provider credential.

LINE revoke is a bounded best-effort cleanup and does not trap the member in a
local Supabase session. A page reload discards the page-memory provider token;
when it is missing, the client does not claim provider revoke and continues to
the bounded local sign-out. A direct Edge Function call without a provider token
still fails closed with `LINE_PROVIDER_TOKEN_REQUIRED`. Local sign-out failure or
an unconfirmed timeout remains an explicit recoverable/uncertain state rather
than being reported as success.

The Edge Function retains a valid UUID-shaped `X-Request-ID` or generates one,
returns it on every response header, and includes it in safe error bodies. Its
structured logs contain only `version`, `requestId`, `stage`, `outcome`,
`durationMs`, and fixed `code` values; tokens, bearer values, identities,
secrets, request bodies, and upstream messages are excluded.

## Verification status

Mock and unit-contract coverage can validate request and configuration
boundaries, but it is not a live-provider result. The following items are
**NOT EXECUTED without live credentials**:

- Live LINE callback to Supabase session mapping.
- LINE in-app browser behavior.
- SSO, QR, and authorization-refusal flows.
- Supabase `provider_id` mapping for the `custom:line` identity.
- Provider-token behavior across session refresh and page reload lifecycle.
- Real LINE revoke through the Supabase `line-logout` Edge Function.

Do not represent the mock results as proof that real LINE login or real revoke
works. Perform those checks only with authorized live credentials and the
actual production callback and PWA origin settings.

## Installed PWA return behavior

As of the second 2026-09-06 correction, mobile and desktop installed PWAs attempt
a script-controlled OAuth window directly from the login click, keeping the
original PWA open. Native LINE auto login remains allowed; do not add
`disable_auto_login=true`. The return URL stays at the approved origin root,
within the existing PWA scope. After validating that root, the implementation
adds its own `matrix_line_return` UUID to correlate this callback. User-supplied
redirect paths and query strings remain rejected.

The callback hands its session to the original PWA after matching the origin,
window source and one-time attempt ID. If native LINE opens a fresh callback
tab without an opener, an origin-scoped BroadcastChannel uses the callback's
own UUID to reach the correct waiting PWA. It never selects an arbitrary recent
attempt from shared storage. A detached callback checks for a listening PWA
within 2,500 ms before consuming its session; without a peer the normal app
initializes. Temporary auth windows close after the PWA accepts the session.
The callback does not mount the member-presence UI while the handoff is pending.

The optional LINE revoke token is read from the existing callback fragment before
Supabase clears it, then transferred only in memory to the original PWA. It is
never added to a new URL, log, or storage record. The popup storage marker contains
only a random ID and timestamp.

If the browser cannot provide a controllable window, login uses its original
redirect flow. Different browser/PWA storage partitions, including iOS Home
Screen apps and Safari, cannot communicate through this channel. An unreachable
PWA retains normal browser callback initialization. A successful session import
does not prove OS foreground activation: focus and close can be refused. Verify
actual installed Android/iOS devices with LINE; unit and desktop-browser tests
cannot establish native-app return behavior.

A production check generated an unauthenticated OAuth transaction with the
correlation query and immediately cancelled only that transaction through the
existing Supabase callback. Both responses were HTTP 302; the final redirect
retained the exact UUID at `https://matrixlottery.idv.tw/`. No provider,
callback allowlist or credential configuration was changed. This cancellation
check verifies redirect preservation, not a successful LINE login.

Historical check before the 2026-09-06 correction: on 2026-09-05, the production Supabase authorize endpoint's first HTTP 302 was
checked without following it or completing a login. The control request did not
include `disable_auto_login`; the mobile request's LINE URL included exactly
`disable_auto_login=true`. Both retained `S256` and the existing Supabase callback.
Provider configuration was read but not changed (`authorization_params` was `{}`).

On 2026-09-06, a read-only check of the production Supabase authorize endpoint
without the disabling parameter returned HTTP 302 to `access.line.me`. Its LINE
URL contained neither `disable_auto_login` nor `prompt`, and retained the existing
Supabase callback. The redirect was not followed and no LINE login was completed.
