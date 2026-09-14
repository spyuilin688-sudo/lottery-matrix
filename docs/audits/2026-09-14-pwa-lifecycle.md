# PWA lifecycle audit — 2026-09-14

## Outcome and evidence boundary

One reproduced update-notification defect is fixed locally. A page that first loaded without a service worker controller now recognizes a later worker update after its initial installation. Initial activation remains silent, and reload still requires confirmation through the existing `AppDialog`.

Items 7–10 remain **partial**, because this audit did not have a physical Android device, an installed Chrome/Edge PWA, or a live LINE authentication session. Automated event simulation is not evidence of OS installation, native foreground return, or an actual browser worker update followed by document reload.

Baseline: source reconstructed from GitHub `main` commit `28fbac6e1d1340f9e47f4ffcdcb446e8e0bb8c18`; the coordinator verified source files against their Git blob hashes. During the audit the coordinator initialized local source-only Git baseline `6b0aa52`, matching 1,300 original remote blobs. The reconstruction lacks 93 image binaries; they must remain preserved in the remote tree. Production target: [樂彩 Matrix](https://matrixlottery.idv.tw/). This audit made no production changes.

Runtime: Node `v24.19.0`, Vitest `4.1.10`, React `19.2.7`, jsdom `29.1.1`. All commands below ran from the reconstructed repository on 2026-09-14 UTC. No full-project tests ran.

## Items 7–10 traceability

| Item | Requirement | Fresh evidence | Result and remaining gap |
| --- | --- | --- | --- |
| 7 | Android Chrome/Edge PWA installation | Inspected manifest: stable root `id`, `start_url` and `scope`; localized name; `fullscreen`; standard and maskable 192/512 PNG declarations. Install DOM tests cover capture of `beforeinstallprompt`, accepted prompt, iOS instructions and hiding after `appinstalled`; display-mode tests cover installed contexts. | Partial. No physical installation. Manifest PNG byte/dimension test was not run because the reconstruction lacks image binaries. Declared icons do not establish successful delivery or decoding. |
| 8 | `skipWaiting`, `clients.claim`, old-cache cleanup, build hash, update prompt and reload end to end | Real worker source evaluated through lifecycle event handlers; install prepares complete CSS/JS before `skipWaiting`; activation claims clients; obsolete shell caches are removed while the preceding complete generation and unrelated caches survive. Build stamping tests verify stable fingerprints, embedded asset paths and changed fingerprints for app/worker edits. Seven lifecycle DOM tests include first claim → later update → confirmation → reload callback. | Partial. Local missed-prompt defect fixed. Worker lifecycle, build stamping and page dialog are exercised in separate test seams, not one browser deployment/update/reload journey. Reload is a spy; no document-navigation result is claimed. |
| 9 | Cache hits, offline fallback, disconnection and network recovery | Fourteen worker/cache tests pass, including two added checks: cache hits issue no network request online or offline; empty offline navigation returns 503 text, connectivity restoration returns/caches a complete shell, and another offline request reuses it. Invalid asset MIME, incomplete updates, full/unavailable storage, previous-version assets and old poisoned CSS recovery also pass. | Partial. Deterministic fetch failures and cache storage fakes verify worker logic; no physical radio toggle or full application reconnect/data-refresh journey was performed. Recovery evidence includes a new navigation request after connectivity returns. |
| 10 | Actual Android installed-PWA LINE login and return | Named auth tests cover mobile controlled-window choice/fallback, detached callback session import and acknowledgement, origin/attempt correlation, callback errors, denied focus, expired attempts and unavailable channels. Worker tests verify exact waiting-client recovery after worker restart and avoid claiming successful return when focus is refused. Fallback tests verify the Android intent link and ordinary root link. | Partial. No live LINE login, Android task switcher observation, install-browser/default-browser combination, or proof of PWA foreground state. Passing session/worker tests do not establish native return. |

Chrome's documented install-promotion requirements accept `fullscreen`, require HTTPS, an eligible manifest and browser engagement criteria. This source manifest has the listed field structure; that is a static prerequisite check, not browser acceptance. [Chrome install criteria](https://web.dev/articles/install-criteria). The worker's install/claim ordering was checked against the documented lifecycle semantics. [Service worker lifecycle](https://web.dev/articles/service-worker-lifecycle).

## Reproduced defect and minimal fix

**Medium severity, confirmed:** `src/pwa-lifecycle.tsx:79` captured `hadController` once when the effect mounted. If false, every later `controllerchange` returned early until a rerender happened to recreate the effect. An open first-visit page could therefore miss updates after its first worker claimed it.

Regression: `src/pwa-lifecycle.test.tsx:176`, `offers a later update after the first controller claims an already open page`, renders the real provider and shared dialog with a stable reload callback. It sends the first controller claim, verifies no update dialog, sends a later controller claim, expects the update dialog, verifies no premature reload, and confirms to reload once.

At **17:12:49 UTC**, before the source fix:

```text
node node_modules/vitest/vitest.mjs run src/pwa-lifecycle.test.tsx
Exit 1: 1 failed, 6 passed
Unable to find role="dialog" and name "發現新版本"
```

The minimal change remembers when the first controller claim occurred, then lets later changes follow the existing prompt path. At **17:13:10 UTC**, the same command returned **exit 0, 7 passed**. No registration, timeout, listener-cleanup, worker caching, CSS, or hourly-refresh implementation was changed.

Changed files:

- `src/pwa-lifecycle.tsx`: controller state tracking.
- `src/pwa-lifecycle.test.tsx`: first-claim/later-update regression.
- `tests/pwa-asset-recovery.test.mjs`: explicit cache-hit and connectivity-recovery evidence; existing worker logic already satisfied both checks.
- This audit report.

## Final focused verification

At **17:14:27 UTC**, the following command returned **exit 0: 8 files, 83 tests passed**:

```sh
node node_modules/vitest/vitest.mjs run src/pwa-lifecycle.test.tsx src/pwa-display-mode.test.ts src/push-service-worker.test.ts src/pwa-startup-recovery.test.ts src/auth/__tests__/line-auth-mobile-pwa-popup.test.ts src/auth/__tests__/line-pwa-return.test.ts src/auth/__tests__/line-login-popup.test.ts src/auth/__tests__/line-pwa-callback-bootstrap.test.tsx
```

At **17:14:44 UTC**, both commands returned **exit 0**, with **3** and **26** passing tests respectively:

```sh
node node_modules/vitest/vitest.mjs run src/auth/__tests__/LinePwaReturnFallback.test.tsx
node --test tests/pwa-build-version.test.mjs tests/line-pwa-service-worker.test.mjs tests/line-pwa-manifest.test.mjs tests/pwa-asset-recovery.test.mjs
```

Total: **112 focused tests passed**. These are logic, DOM and worker-event checks. They are not 112 device checks.

The Frontend Design Premium strict static audit was also run with `--no-write`. It exited 1 with three `affordance.actionless-button` findings in pre-existing test doubles: `src/__tests__/AppPermissionSettings.test.tsx:20`, `src/__tests__/TianyanExpandedLayoutPatch.test.tsx:124`, and `src/permission-settings.test.tsx:21`. No findings referenced the changed production file. Those test fixtures were inspected and left unchanged. This is not a clean strict-audit claim. Typecheck, production build, and shared-browser integration are coordinator-owned checks and are not asserted by this report.

## Remaining acceptance evidence

Record actual model, Android version, Chrome/Edge version, default browser, install browser, LINE version and source build for each device run. Do not replace device evidence with a mobile user agent.

| Journey | Required observation to close the gap |
| --- | --- |
| Install from Android Chrome and Edge | Browser accepts installation; correct icon/name; launch from home screen into fullscreen PWA; installed action disappears; relaunch succeeds. |
| Existing installation receives a newer build | Capture initial/new worker build IDs, complete new cache, retained preceding generation, actual controller change, visible update prompt, postpone behavior, confirmed document reload and new asset references. |
| Installed offline/recovery | After online preparation, disable real connectivity, relaunch and visit previously cached app shell/assets; record fallback for unavailable resources; restore connectivity and verify actual UI/data recovery. |
| LINE return | Launch login from installed PWA; complete native LINE authorization; verify the original PWA becomes foreground and its own authenticated UI is usable; record ordinary/default-browser and denied-focus fallbacks, cancellation, and retry. Do not record tokens or callback query/hash values. |

Documentation drift also remains: `UX-CONTRACT.md:160–165` says mobile uses original-PWA navigation and desktop uses a popup, while current `line-auth.ts` and `line-auth-mobile-pwa-popup.test.ts` explicitly use a controlled popup for mobile PWAs with same-window fallback. The audit does not alter the authentication strategy or rewrite that contract; the coordinator should reconcile the latest approved intent before treating it as acceptance authority.
