# LINE login return from an installed PWA

Base: main `40ae2a5f995946e1312c2ae68a0b982964c4bc33`. The concurrent visitor-counting changes were retained; tracking starts when the real App mounts, after a temporary OAuth callback is handled.

## Goal and boundaries

Keep the installed Matrix window alive during LINE OAuth, import the confirmed
session back into that window, close the temporary authorization window, then
use the existing SPA navigation to return home. Keep the exact origin-root
redirect allowlist and the ordinary browser redirect flow.

The manifest requests fullscreen. Detect fullscreen, standalone, minimal-ui and
iOS navigator.standalone with one shared helper; installation UI and login must
agree. No changes to page geometry, scopes, Supabase provider configuration,
Watchdog permissions, or the confirmed double-click shortcut behavior.

## Implementation and review

1. Reproduce missing PWA window handling in the LINE auth helper test (RED).
2. Open a temporary window synchronously in the login click before awaiting the
   SDK, then request its OAuth URL with skipBrowserRedirect.
3. Store only a random attempt ID and timestamp in the popup sessionStorage.
   Require matching origin, exact window source and attempt ID for result/ACK.
   Import access/refresh through Supabase setSession. Keep an optional LINE revoke
   token in memory only, captured before the SDK clears the callback fragment.
4. Process popup callbacks before mounting App so the temporary window does not
   start a second member presence. Close after the PWA acknowledges its session.
5. Bound abandoned attempts (10 minutes), callback session reads and session
   imports (15 seconds each), and ACK waiting (30 seconds). Window operations
   that the platform refuses cannot leave the promise unresolved.
6. Keep login pending during early SDK BroadcastChannel events. After popup
   failure, reconcile the actual session before choosing anonymous, authenticated
   or the existing retry state. Ordinary OAuth errors retain their existing UI.
7. Run auth/profile/PWA regressions, the full unit suite, TypeScript and production
   build. Independently review the handoff and latest-main delta before delivery.

## Platform fallback and verification limits

If opening a controllable window fails, keep the original redirect flow. If LINE
or the OS opens a different browser context, the opener or sessionStorage marker
may be lost: the callback must load the ordinary application, not weaken message
validation or remain blank. Browser-denied close/focus also falls back safely.

This patch does not claim that JavaScript can force every Android/iOS native LINE
handoff back into an installed PWA. A physical device with an authorized LINE
account is still required to verify that flow. No live-provider test was performed.

References consulted: Supabase auth-js 2.112.3 source; official Supabase OAuth
reference; web.dev/learn/pwa/windows; LINE Developers 2026-05-07 launch guidance.

## Verification results

- Full Vitest: 139 files, 1,134 tests passed on the updated main snapshot.
- Targeted Node contracts: 13 passed.
- TypeScript and production Pages build passed. Runtime hashes verified for all 27 protected files; only the deliberate main.tsx hash changed.
- Independent auth review completed; session-race, bounded import, refused window operations and fallback provider-token handling were addressed.
- Physical-device LINE provider authorization was not executed.
