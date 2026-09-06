- Real LINE revoke through the Supabase `line-logout` Edge Function.

Do not represent the mock results as proof that real LINE login or real revoke
works. Perform those checks only with authorized live credentials and the
actual production callback and PWA origin settings.

## Installed PWA return behavior

Mobile installed PWAs start OAuth in the original window, restoring the mobile
routing used before PR #357. The mobile return URL is exactly the approved
origin root, within the existing PWA scope, without a popup correlation query.
Native LINE auto login remains allowed; do not add `disable_auto_login=true`.

The manifest now declares an explicit root app identity and scope, plus
`launch_handler.client_mode = "navigate-existing"`. This tells compatible
browser PWA launch handling to reuse the existing installed Matrix client for
an in-scope HTTPS callback rather than creating a new application client. On
Android, WebAPK URL routing is based on the manifest scope; the installed app
must therefore receive the updated manifest before this routing can take effect.
OS/browser navigation decisions remain authoritative, so physical-device
verification is still required.

Desktop installed PWAs retain the script-controlled authorization window opened
directly from the login click. After validating the approved root, this popup
flow adds its own `matrix_line_return` UUID to correlate the callback.
User-supplied redirect paths and query strings remain rejected. The following
handoff also remains available for callbacks from older clients that already
opened a popup.

The callback hands its session to the original PWA after matching the origin,
window source and one-time attempt ID. If native LINE opens a fresh callback
tab without an opener, an origin-scoped BroadcastChannel uses the callback's
own UUID to reach the correct waiting PWA. It never selects an arbitrary recent
attempt from shared storage. A detached callback checks for a listening PWA
within 2,500 ms before consuming its session; without a peer the normal app
initializes. Temporary auth windows attempt to close after the PWA accepts the session.

For implicit callbacks, the handler captures the Supabase access/refresh tokens,
removes the fragment with `history.replaceState` before creating the Auth client,
and validates/imports them through `setSession`. The installed Auth client's
automatic implicit parser clears `location.hash` by navigation, which adds a
history entry and can prevent a native-opened tab from closing. Native OS
foreground activation still requires a physical-device check.

The optional LINE revoke token is read from the existing callback fragment before
Supabase clears it, then transferred only in memory to the original PWA. It is
never added to a new URL, log, or storage record. The popup storage marker contains
only a random ID and timestamp.

If the browser cannot provide a controllable window, login uses its original
redirect flow. Different browser/PWA storage partitions, including iOS Home
Screen apps and Safari, cannot communicate through this channel. An unreachable
PWA retains normal browser callback initialization. A successful session import
must never be treated as proof that the operating system foregrounded the PWA.
