# 樂彩 Matrix LINE Login API Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 以最新 `main` 的既有 Supabase `custom:line` 與 member bootstrap 為基礎，補齊可測試的 LINE logout/revoke API、安全邊界、明確的會員登出動作與正式設定文件，同時移除核准規格明確排除的登入畫面與全站 Auth Gate。

**Architecture:** Supabase Auth 繼續是唯一 session owner。登入 helper 只啟動 `custom:line` OAuth；AppDeploy 的 bootstrap 只信任 Supabase `/auth/v1/user` 回傳的 identity；新 logout endpoint 先驗證 Supabase bearer，再以 LINE verify、userinfo、revoke 三段 server-side 呼叫驗證 Channel 與 `sub`。前端只有在 revoke 成功後才執行 Supabase `signOut()`，不新增第二套 JWT、持久化 token store、登入頁或 auth gate；LINE provider token 僅可在當前頁面行程內短暫持有。

**Tech Stack:** React 19、TypeScript、Vite、Supabase JS 2.112.x、AppDeploy SDK router、Vitest、Testing Library、LINE Login v2.1 REST API。

**Spec:** `docs/superpowers/specs/2026-08-24-line-login-api-design.md`

**Execution baseline:** `c37d61deb510ad664b9f2feae2045de910c50502` (`main` = `origin/main` on 2026-08-24). The older `docs/superpowers/plans/2026-08-24-line-login-integration.md` is superseded where it adds `LineAuthGate` or a login screen.

## Global Constraints

- Start with `git fetch origin main && git merge --ff-only origin/main`; stop and re-plan if the fetched HEAD changes any owned file or no longer descends from the execution baseline.
- Provider identifier remains exactly `custom:line`.
- Do not add a login screen, auth gate, LIFF, Messaging API, account deletion, unlink, account merge, or another session format.
- Do not trust `line_user_id`, profile data, or display name from request bodies.
- Do not persist or log LINE provider tokens, authorization codes, Channel secret, Supabase service-role key, or full user payloads.
- `LINE_CHANNEL_ID` and `LINE_CHANNEL_SECRET` are server secrets. They must not become Vite variables or frontend constants.
- The only approved PWA return URL is the normalized origin root (`${window.location.origin}/`). Reject every path, query, fragment, or different origin before calling Supabase.
- The direct profile button owns the logout action; do not use document-level click delegation or a fake handler.
- Do not claim real LINE login or real revoke is verified without an actual LINE Channel, exact callback registration, allowlisted PWA URL, and live end-to-end evidence.

---

### Task 1: Build a UI-free member session/bootstrap coordinator

**Files:**
- Create: `src/auth/MemberSessionBridge.tsx`
- Create: `src/auth/__tests__/MemberSessionBridge.test.tsx`
- Create: `src/auth/line-provider-token.ts`
- Create: `src/auth/__tests__/line-provider-token.test.ts`

**Interfaces:**
- Produces: `MemberSessionBridge`, which always renders `null` and never gates or hides the app.
- Consumes: Supabase `getSession()` / `onAuthStateChange()` and existing `bootstrapMember()`.
- Produces: process-memory-only `rememberLineProviderToken`, `readLineProviderToken`, and `clearLineProviderToken`.
- Does not integrate into `App` until Task 6, where it atomically replaces the visual gate.

- [ ] **Step 1: Write failing bridge and token-memory tests**

Cover these exact behaviors:

```tsx
render(<MemberSessionBridge client={client} bootstrap={bootstrapMember} />);
expect(container).toBeEmptyDOMElement();
await waitFor(() => expect(bootstrapMember).toHaveBeenCalledTimes(1));
```

- Initial session and later `SIGNED_IN` each bootstrap once per distinct Supabase access token.
- A duplicate auth event for the same token does not duplicate bootstrap.
- The `onAuthStateChange` callback returns synchronously before bootstrap starts; advancing the queued task starts bootstrap outside the callback.
- A bootstrap rejection leaves the bridge invisible and permits a later auth event to retry; it does not log the session or token.
- `SIGNED_OUT` clears ephemeral provider-token memory.
- `rememberLineProviderToken` accepts only a non-empty string; read/clear never touch `localStorage` or `sessionStorage`.

- [ ] **Step 2: Verify RED**

Run:

```bash
npx vitest run src/auth/__tests__/MemberSessionBridge.test.tsx src/auth/__tests__/line-provider-token.test.ts
```

Expected: FAIL because the bridge and ephemeral token module do not exist.

- [ ] **Step 3: Implement the non-visual coordinator**

Use the session access token as the idempotency key. Capture `session.provider_token` only in module memory when Supabase supplies it immediately after OAuth. Never serialize that value. The `onAuthStateChange` callback must be synchronous: it may only capture/clear ephemeral state and enqueue work with `setTimeout(..., 0)`; it must never call or await `bootstrapMember()`, `getSession()`, or another Supabase auth method inside the callback. Track and cancel pending timers during cleanup. Initial `getSession()` work and queued auth-event bootstrap both run outside the callback. Subscribe and unsubscribe through the Supabase auth API, and always return `null`:

```tsx
export function MemberSessionBridge({ client = getSupabaseClient(), bootstrap = bootstrapMember }: Props) {
  useEffect(() => {
    // getSession + onAuthStateChange; dedupe by access_token; remember provider_token in memory only
  }, [bootstrap, client]);
  return null;
}
```

Do not integrate it into `App` yet: the current gate remains the production bootstrap owner until Task 6 can replace it atomically with direct verified logout.

- [ ] **Step 4: Verify GREEN**

Run the targeted command from Step 2. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/auth/MemberSessionBridge.tsx src/auth/__tests__/MemberSessionBridge.test.tsx src/auth/line-provider-token.ts src/auth/__tests__/line-provider-token.test.ts
git commit -m "feat: add nonvisual LINE member session bridge"
```

---

### Task 2: Constrain the LINE OAuth return URL

**Files:**
- Modify: `src/auth/line-auth.ts`
- Modify: `src/auth/__tests__/line-auth.test.ts`

**Interfaces:**
- Produces: `signInWithLine(redirectTo?: string, client?: SupabaseClient): Promise<void>`.
- Accepts: only the normalized current-origin root.
- Rejects: same-origin paths/queries/fragments and external origins before `signInWithOAuth` is called.

- [ ] **Step 1: Write failing tests**

```ts
it("uses the exact approved origin root", async () => {
  await signInWithLine(`${window.location.origin}/`, client);
  expect(signInWithOAuth).toHaveBeenCalledWith({
    provider: "custom:line",
    options: { redirectTo: `${window.location.origin}/` },
  });
});

it("rejects an unapproved same-origin path", async () => {
  await expect(signInWithLine(`${window.location.origin}/profile`, client))
    .rejects.toThrow("LINE_RETURN_URL_NOT_ALLOWED");
  expect(signInWithOAuth).not.toHaveBeenCalled();
});

it("rejects a cross-origin return URL before starting OAuth", async () => {
  await expect(signInWithLine("https://attacker.example/callback", client))
    .rejects.toThrow("LINE_RETURN_URL_NOT_ALLOWED");
  expect(signInWithOAuth).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Verify RED**

Run: `npx vitest run src/auth/__tests__/line-auth.test.ts`

Expected: both rejection tests fail because current code forwards arbitrary `redirectTo` values.

- [ ] **Step 3: Implement the exact origin-root allowlist**

```ts
function resolveApprovedRedirect(redirectTo: string, origin: string) {
  const approved = new URL("/", origin).href;
  const resolved = new URL(redirectTo, approved).href;
  if (resolved !== approved) throw new TypeError("LINE_RETURN_URL_NOT_ALLOWED");
  return approved;
}
```

Default `redirectTo` to `new URL("/", window.location.origin).href` and call the exact resolver before `signInWithOAuth`. Preserve provider `custom:line` and propagate Supabase errors unchanged.

- [ ] **Step 4: Verify GREEN and commit**

Run: `npx vitest run src/auth/__tests__/line-auth.test.ts`

```bash
git add src/auth/line-auth.ts src/auth/__tests__/line-auth.test.ts
git commit -m "fix: constrain LINE OAuth return URLs"
```

---

### Task 3: Lock down the existing member bootstrap contract

**Files:**
- Modify: `backend/member-bootstrap.test.ts`
- Modify: `backend/member-bootstrap-routes.test.ts`
- Modify: `backend/member-route-registration.test.ts`
- Modify: `src/matrix-api-client.ts`
- Modify: `src/matrix-api-client.test.ts`
- Modify: `src/member-api.test.ts`

**Interfaces:**
- Preserves: `POST /api/member/bootstrap` and `{ memberId, lineUserId }`.
- Preserves server codes: `AUTH_REQUIRED`, `LINE_IDENTITY_REQUIRED`, `LINE_IDENTITY_CONFLICT`.
- Produces: frontend errors retain a recognized server error code instead of replacing every 403/409 with a Matrix-analysis code.

- [ ] **Step 1: Add missing backend security tests**

Cover these exact assertions:

```ts
expect(authRequest.headers).toMatchObject({
  apikey: "anon-key",
  Authorization: "Bearer supabase-access-token",
});
expect(JSON.parse(createRequest.body as string)).toEqual({
  auth_user_id: "auth-user-1",
  line_user_id: "line-user-1",
});
```

The route-registration test must pass a body containing a forged `line_user_id` and prove the bootstrap dependency receives only the authorization header. Add POST and PATCH unique-conflict cases that both produce HTTP 409 with `LINE_IDENTITY_CONFLICT`.

- [ ] **Step 2: Add a failing client error-code test**

```ts
it("preserves a recognized API error code", async () => {
  fetcher.mockResolvedValue(new Response(
    JSON.stringify({ error: { code: "LINE_IDENTITY_CONFLICT" } }),
    { status: 409, headers: { "content-type": "application/json" } },
  ));
  await expect(client.fetchJson("/api/member/bootstrap", { method: "POST" }))
    .rejects.toMatchObject({ status: 409, code: "LINE_IDENTITY_CONFLICT" });
});
```

- [ ] **Step 3: Verify RED**

Run:

```bash
npx vitest run backend/member-bootstrap.test.ts backend/member-bootstrap-routes.test.ts backend/member-route-registration.test.ts src/matrix-api-client.test.ts src/member-api.test.ts
```

Expected: the client error-code test fails with `ANALYSIS_VERSION_MISMATCH`.

- [ ] **Step 4: Parse recognized JSON error bodies safely**

Extend `MatrixApiErrorCode` with this exact remote status/code map:

```ts
const REMOTE_ERROR_STATUS = {
  AUTH_REQUIRED: 401,
  LINE_PROVIDER_TOKEN_REQUIRED: 400,
  LINE_IDENTITY_REQUIRED: 403,
  LINE_IDENTITY_CONFLICT: 409,
  LINE_LOGIN_NOT_CONFIGURED: 503,
  LINE_PROVIDER_REQUEST_FAILED: 502,
  MEMBER_BOOTSTRAP_FAILED: 502,
} as const;
```

`MEMBER_BOOTSTRAP_FAILED` remains the existing safe bootstrap fallback; it is not a LINE provider error. On a non-2xx response, read JSON only when the content type is JSON and accept a remote code only when its configured status equals `response.status`. Unknown strings, wrong status/code pairs, malformed JSON, and non-JSON bodies retain the existing status fallback. Do not return the server body or token in the thrown message.

```ts
const remoteCode = isRecognizedApiErrorCode(payload?.error?.code, response.status)
  ? payload.error.code
  : codeForStatus(response.status);
throw new MatrixApiError(remoteCode, response.status);
```

Add tests for an unknown code, `409 LINE_IDENTITY_REQUIRED` mismatch, malformed JSON, and non-JSON 502. Each must fall back without leaking the body.

- [ ] **Step 5: Verify GREEN and commit**

Run the targeted command from Step 3. Expected: PASS.

```bash
git add backend/member-bootstrap.test.ts backend/member-bootstrap-routes.test.ts backend/member-route-registration.test.ts src/matrix-api-client.ts src/matrix-api-client.test.ts src/member-api.test.ts
git commit -m "test: harden LINE member bootstrap contracts"
```

---

### Task 4: Implement the server-side LINE logout service

**Files:**
- Create: `backend/line-logout.ts`
- Create: `backend/line-logout.test.ts`

**Interfaces:**
- Produces: `createLineLogout(loadSupabaseConfig, loadLineConfig, fetcher?)`.
- Produces: `logout(authorization, providerAccessToken): Promise<void>`.
- Produces exact public codes: `AUTH_REQUIRED`, `LINE_PROVIDER_TOKEN_REQUIRED`, `LINE_IDENTITY_REQUIRED`, `LINE_LOGIN_NOT_CONFIGURED`, `LINE_PROVIDER_REQUEST_FAILED`.

- [ ] **Step 1: Write the failing service suite**

Tests must cover:

1. Missing/invalid Supabase bearer returns 401 before any LINE request.
2. Valid Supabase user without `custom:line` returns 403.
3. Missing provider token returns 400.
4. Missing Channel ID or secret returns 503.
5. Verify request uses `GET https://api.line.me/oauth2/v2.1/verify?access_token=...`; `client_id` must equal the configured Channel ID and `expires_in` must be a finite positive number.
6. Userinfo request uses bearer auth; `sub` must be a non-empty string equal to the Supabase identity `provider_id`.
7. Revoke request uses form-encoded `access_token`, `client_id`, and `client_secret`.
8. Any non-2xx response, rejected fetch, malformed JSON, missing required field, `expires_in <= 0`, Channel mismatch, or `sub` mismatch maps to fixed 502 `LINE_PROVIDER_REQUEST_FAILED` and stops subsequent LINE calls.
9. A rejected fetch whose message contains `provider-token` never exposes that message through the service error.
10. The success path resolves only after revoke returns 200.

Representative success assertions:

```ts
expect(fetchCalls[1].url).toContain("/oauth2/v2.1/verify?access_token=provider-token");
expect(fetchCalls[2].init.headers).toMatchObject({ Authorization: "Bearer provider-token" });
expect(String(fetchCalls[3].init.body)).toBe(
  "access_token=provider-token&client_id=line-channel&client_secret=line-secret",
);
```

- [ ] **Step 2: Verify RED**

Run: `npx vitest run backend/line-logout.test.ts`

Expected: FAIL because `backend/line-logout.ts` does not exist.

- [ ] **Step 3: Implement the minimal service**

Use separate lazy config loaders so missing LINE credentials do not break member, notification, Matrix, or health routes:

```ts
type SupabaseAuthConfig = { url: string; anonKey: string };
type LineLoginConfig = { channelId: string; channelSecret: string };
```

Required order inside `logout`:

```text
parse bearer
GET Supabase /auth/v1/user
resolve custom:line provider_id
require providerAccessToken
load LINE Channel config
GET LINE verify and compare client_id
GET LINE userinfo and compare sub
POST LINE revoke
return void
```

Use `URL`/`URLSearchParams`, `response.ok`, guarded JSON parsing, and fixed public errors. Wrap each LINE network/parse/validation stage so every provider-side failure becomes a fresh `LineLogoutError("LINE_PROVIDER_REQUEST_FAILED", 502)`. Preserve only known bearer/identity/config errors. Never call `console.*`, include a thrown/network/upstream message in the public error, or retain the token outside the request scope.

- [ ] **Step 4: Verify GREEN and commit**

Run: `npx vitest run backend/line-logout.test.ts`

```bash
git add backend/line-logout.ts backend/line-logout.test.ts
git commit -m "feat: add verified LINE token revoke service"
```

---

### Task 5: Expose `POST /api/auth/line/logout`

**Files:**
- Create: `backend/line-logout-routes.ts`
- Create: `backend/line-logout-routes.test.ts`
- Create: `backend/line-auth-route-handlers.ts`
- Create: `backend/line-auth-route-handlers.test.ts`
- Modify: `backend/index.ts`
- Modify: `backend/member-route-registration.test.ts`

**Interfaces:**
- Consumes: `Authorization: Bearer <Supabase access token>`.
- Consumes body: `{ providerAccessToken }`.
- Produces: HTTP 200 `{ ok: true }` after verified revoke.
- Produces: exact status/code pairs from the approved spec.

- [ ] **Step 1: Write failing route and registration tests**

```ts
expect(Object.keys(handlers)).toContain("POST /api/auth/line/logout");
expect(logoutPost).toHaveBeenCalledWith({
  authorization: "Bearer session-token",
  body: { providerAccessToken: "provider-token" },
});
```

Verify route errors are `{ error: { code } }` with no token or upstream details.

Add `null`, number, object, empty-string, and whitespace-only `providerAccessToken` cases. They must produce 400 `LINE_PROVIDER_TOKEN_REQUIRED` and make no LINE/config request after bearer/identity validation.

Extend the existing real `backend/index.ts` registration test, which imports exported `handler`, to require `handler['POST /api/auth/line/logout']` and invoke it without a bearer, expecting 401 `AUTH_REQUIRED`. A factory-only assertion is insufficient. Keep the valid-bearer invalid-body matrix in the isolated route/service tests so it does not require real secrets.

- [ ] **Step 2: Verify RED**

Run:

```bash
npx vitest run backend/line-logout-routes.test.ts backend/line-auth-route-handlers.test.ts backend/member-route-registration.test.ts
```

Expected: FAIL because the route modules do not exist.

- [ ] **Step 3: Implement route adapters and lazy secret loading**

`backend/index.ts` must add a dedicated loader:

```ts
async function loadLineLoginConfig() {
  const names = await secrets.listSecretNames();
  if (!names.includes("LINE_CHANNEL_ID") || !names.includes("LINE_CHANNEL_SECRET")) {
    throw new LineLogoutError("LINE_LOGIN_NOT_CONFIGURED", 503);
  }
  const [channelId, channelSecret] = await Promise.all([
    secrets.readSecret("LINE_CHANNEL_ID"),
    secrets.readSecret("LINE_CHANNEL_SECRET"),
  ]);
  if (!channelId?.trim() || !channelSecret?.trim()) {
    throw new LineLogoutError("LINE_LOGIN_NOT_CONFIGURED", 503);
  }
  return { channelId: channelId.trim(), channelSecret: channelSecret.trim() };
}
```

Instantiate the service lazily, spread the new route handler into the existing router, and do not add LINE secrets to `loadMatrixSupabaseConfig()`.

- [ ] **Step 4: Verify GREEN and commit**

Run:

```bash
npx vitest run backend/line-logout.test.ts backend/line-logout-routes.test.ts backend/line-auth-route-handlers.test.ts backend/member-route-registration.test.ts
```

```bash
git add backend/line-logout-routes.ts backend/line-logout-routes.test.ts backend/line-auth-route-handlers.ts backend/line-auth-route-handlers.test.ts backend/index.ts backend/member-route-registration.test.ts
git commit -m "feat: expose LINE logout API"
```

---

### Task 6: Atomically install direct logout and remove the visual Auth Gate

**Files:**
- Modify: `src/auth/line-auth.ts`
- Modify: `src/auth/__tests__/line-auth.test.ts`
- Modify: `src/auth/line-provider-token.ts`
- Modify: `src/auth/__tests__/line-provider-token.test.ts`
- Modify: `src/auth/MemberSessionBridge.tsx`
- Modify: `src/auth/__tests__/MemberSessionBridge.test.tsx`
- Modify: `src/FeaturePages.tsx`
- Modify: `src/__tests__/MemberProfilePage.test.tsx`
- Modify: `src/feature-pages.css`
- Modify: `src/App.tsx`
- Modify: `src/__tests__/app-production-shell.test.tsx`
- Modify: `src/admin/__tests__/AdminApp.test.tsx`
- Delete: `src/auth/LineAuthGate.tsx`
- Delete: `src/auth/line-login.css`
- Delete: `src/auth/__tests__/LineAuthGate.test.tsx`

**Interfaces:**
- Produces: `revokeLineProviderToken(providerAccessToken): Promise<void>`.
- Produces: `signOutFromMatrix(client?, revoke?): Promise<void>`.
- Integrates: UI-free `MemberSessionBridge` as the session-to-bootstrap owner while `Prototype` always renders.
- Profile logout remains visibly labelled `登出`, is disabled while pending, and preserves the session when revoke fails.
- If revoke succeeds but Supabase sign-out fails, records only a process-memory marker for that exact Supabase access token so a retry skips the already-completed revoke and retries Supabase sign-out.
- Removes: login screen, render gate, and document-level `.profile-logout` delegation in the same commit that installs direct ownership.

- [ ] **Step 1: Write failing helper tests**

```ts
it("revokes the LINE token before Supabase signOut", async () => {
  const order: string[] = [];
  getSession.mockResolvedValue({ data: { session: { provider_token: "provider-token" } }, error: null });
  revoke.mockImplementation(async () => { order.push("revoke"); });
  signOut.mockImplementation(async () => { order.push("signOut"); return { error: null }; });
  await signOutFromMatrix(client, revoke);
  expect(order).toEqual(["revoke", "signOut"]);
});

it("does not clear Supabase when LINE revoke fails", async () => {
  revoke.mockRejectedValue(new Error("LINE_PROVIDER_REQUEST_FAILED"));
  await expect(signOutFromMatrix(client, revoke)).rejects.toThrow("LINE_PROVIDER_REQUEST_FAILED");
  expect(signOut).not.toHaveBeenCalled();
});
```

Also cover:

- `getSession()` error: reject, no revoke, no Supabase sign-out.
- Current session has no `provider_token`, but Task 1 captured one from the immediately preceding OAuth auth event: use the in-memory token.
- Refreshed/reloaded session has neither `provider_token` nor in-memory token: reject with fixed 400 `LINE_PROVIDER_TOKEN_REQUIRED`, do not call the API, and do not Supabase sign-out.
- Successful revoke/sign-out clears the in-memory token; revoke failure retains it for one retry.
- Revoke succeeds but `client.auth.signOut()` returns or throws an error: reject with fixed `SUPABASE_SIGN_OUT_FAILED`, clear the now-invalid provider token, retain a process-memory `LINE already revoked` marker keyed to that exact Supabase access token, and keep the Supabase session available for retry.
- Retrying with the same access token and the revoked marker skips LINE revoke, calls only Supabase `signOut()`, then clears all ephemeral token/marker state on success. A different access token must never inherit the marker.
- A later `SIGNED_OUT` event clears all ephemeral token and revoked-marker state even when it originates outside this helper.
- `revokeLineProviderToken` sends JSON `{ providerAccessToken }` to `/api/auth/line/logout` through the authenticated API client.

This explicitly accepts the Supabase provider-token lifecycle boundary: provider tokens are available immediately after OAuth but are not guaranteed after refresh/reload. The implementation may hold the token only in page-process memory, never storage; therefore refreshed sessions without a token fail closed instead of falsely claiming LINE revoke.

- [ ] **Step 2: Write the failing profile interaction test**

Mock `signOutFromMatrix`, click the real `登出` button, verify it is disabled during the promise, and verify a rejected promise renders `role="alert"` with `登出失敗，請稍後再試` while leaving the button usable for retry.

Update the app-shell test to remove the `LineAuthGate` mock, mock `MemberSessionBridge` as an invisible component, keep the existing `Prototype` text mock, and assert `getByText("member-root")`. Add a source assertion that `App.tsx` imports `MemberSessionBridge` and contains neither `LineAuthGate` nor `line-login.css`.

- [ ] **Step 3: Verify RED**

Run:

```bash
npx vitest run src/auth/__tests__/line-auth.test.ts src/auth/__tests__/line-provider-token.test.ts src/auth/__tests__/MemberSessionBridge.test.tsx src/__tests__/MemberProfilePage.test.tsx src/__tests__/app-production-shell.test.tsx src/admin/__tests__/AdminApp.test.tsx
```

Expected: FAIL because sign-out currently skips revoke, the profile button has no direct action, and `App` still uses the visual gate.

- [ ] **Step 4: Implement direct logout and the non-gating app shell atomically**

Resolve the current Supabase access token first. If a process-memory revoked marker matches that exact access token, skip LINE revoke and retry only `client.auth.signOut()`. Otherwise resolve the provider token from the current Supabase session, then Task 1's process-memory capture. Do not copy either token or the marker to localStorage, sessionStorage, a database, logs, or React state. If the provider token is absent, throw the fixed local missing-token error.

After a successful revoke, immediately clear the now-invalid provider token and mark LINE revoked for that exact Supabase access token before calling `client.auth.signOut()`. Treat both a returned Supabase error and a rejected promise as `SUPABASE_SIGN_OUT_FAILED`; retain the marker so a same-session retry cannot revoke twice. After successful sign-out, or on any `SIGNED_OUT` event, clear all ephemeral provider-token and revoked-marker state. A revoke failure sets no marker and retains the provider token for one retry.

In `ProfilePage`, use local pending/failure booleans. Keep the existing button label and geometry; add only `onClick`, `disabled`, `aria-busy`, and the scoped alert.

Replace the non-admin `App` branch with:

```tsx
return (
  <>
    <MemberSessionBridge />
    <MobileDeviceProvider>
      <KeyboardProvider>
        <Prototype />
      </KeyboardProvider>
    </MobileDeviceProvider>
  </>
);
```

Delete `LineAuthGate`, its stylesheet, its tests, and its document click listener. Do not delete the OAuth helper or bootstrap client.

- [ ] **Step 5: Verify GREEN and commit**

Run the targeted command from Step 3. Expected: PASS.

```bash
git add src/auth src/FeaturePages.tsx src/__tests__/MemberProfilePage.test.tsx src/feature-pages.css src/App.tsx src/__tests__/app-production-shell.test.tsx src/admin/__tests__/AdminApp.test.tsx
git commit -m "feat: complete nonvisual LINE session integration"
```

---

### Task 7: Document operator configuration without secrets

**Files:**
- Create: `docs/LINE_LOGIN_SETUP.md`
- Create: `tests/line-login-setup.test.mjs`
- Modify: `README.md`

**Interfaces:**
- Documents Supabase identifier/endpoints/scopes/PKCE.
- Documents AppDeploy secret names `LINE_CHANNEL_ID` and `LINE_CHANNEL_SECRET`.
- Separates mock-complete status from live verification status.

- [ ] **Step 1: Add a failing documentation contract test**

Create `tests/line-login-setup.test.mjs` asserting the document contains:

```text
custom:line
https://access.line.me/oauth2/v2.1/authorize
https://api.line.me/oauth2/v2.1/token
https://api.line.me/oauth2/v2.1/userinfo
openid profile
LINE_CHANNEL_ID
LINE_CHANNEL_SECRET
POST /api/auth/line/logout
oauth2
PKCE
S256
email optional
```

Also assert it states the exact allowed return URL is the production origin root, instructs the operator to copy the exact Supabase callback URL rather than infer it, excludes the `email` scope, and does not contain assignments matching `LINE_CHANNEL_SECRET\s*=\s*\S+`.

- [ ] **Step 2: Verify RED**

Run: `node --test tests/line-login-setup.test.mjs`

Expected: FAIL because the setup document does not exist.

- [ ] **Step 3: Write the operator guide**

The guide must instruct an operator to copy the exact callback URL displayed by Supabase into LINE Console, allowlist exactly the production PWA origin root used in Task 2, enable PKCE/S256, and keep email optional without requesting the email scope. Record the following as **not executed without live credentials**: callback/session mapping, LINE in-app browser, SSO/QR/refusal flows, `provider_id` mapping, provider-token behavior after refresh/reload, and real revoke.

- [ ] **Step 4: Verify GREEN and commit**

```bash
node --test tests/line-login-setup.test.mjs
git add docs/LINE_LOGIN_SETUP.md README.md tests/line-login-setup.test.mjs
git commit -m "docs: add LINE login operator setup"
```

---

### Task 8: Scoped verification and cross-plan handoff

**Files:**
- Modify only if a verification failure proves a defect in files already owned by Tasks 1–7.

- [ ] **Step 1: Verify the current dependency/runtime contract**

```bash
node --version
npm run check:runtime
npx tsc --noEmit
npx tsc --noEmit --strict --target ES2022 --module ESNext --moduleResolution Bundler --lib ES2022,DOM backend/line-logout.ts backend/line-logout-routes.ts backend/line-auth-route-handlers.ts backend/member-bootstrap.ts backend/member-bootstrap-routes.ts backend/member-route-handlers.ts
```

Expected: Node satisfies README `>=22.13`; runtime integrity, frontend TypeScript, and the focused backend service/route typecheck pass. The repository has no installed production `@appdeploy/sdk` type package and the root `tsconfig.json` intentionally excludes the full legacy backend; `backend/index.ts` wiring is therefore validated by the real-handler Vitest registration test here and by AppDeploy's deployment compiler after both plans complete. Do not claim the frontend `tsc` command type-checks all backend code.

- [ ] **Step 2: Run LINE/member regression tests**

```bash
npx vitest run src/auth/__tests__/line-auth.test.ts src/auth/__tests__/line-provider-token.test.ts src/auth/__tests__/MemberSessionBridge.test.tsx src/member-api.test.ts src/matrix-api-client.test.ts src/__tests__/MemberProfilePage.test.tsx src/__tests__/app-production-shell.test.tsx backend/member-bootstrap.test.ts backend/member-bootstrap-routes.test.ts backend/member-route-registration.test.ts backend/line-logout.test.ts backend/line-logout-routes.test.ts backend/line-auth-route-handlers.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run all repository verification**

```bash
npm run test:unit
node --test tests/*.test.mjs
npm run test:sites
npm run build
```

Expected at this plan's required execution point: production build and Sites pass; full Vitest has only the eight stale homepage/Tianyan failures enumerated by `2026-08-24-quality-remediation.md`, and Node has only its documented 70 stale-contract failures. Any additional failure blocks this plan. After the quality-remediation plan completes, rerun these commands and require full PASS. Do not change production behavior to satisfy the enumerated stale assertions.

- [ ] **Step 4: Scan the frontend artifact for server secret identifiers**

```bash
if rg -n "LINE_CHANNEL_ID|LINE_CHANNEL_SECRET|SUPABASE_SERVICE_ROLE_KEY" dist/client; then exit 1; fi
```

Expected: no matches.

- [ ] **Step 5: Record the live verification boundary**

Do not mark real OAuth/revoke complete until an operator supplies the Channel, exact callback, and production allowlist. When supplied, verify in this order: Supabase provider status, LINE callback registration, production return URL, OAuth consent/session, bootstrap identity mapping, member API bearer continuity, profile logout/revoke, then denial/error paths.

- [ ] **Step 6: Commit any verification-only corrections**

```bash
git status --short
git diff --check
```

Commit only scoped corrections; leave the worktree clean.

## Completion Criteria

- The app has no new login page or auth gate.
- `signInWithLine` uses `custom:line` and accepts only the exact origin-root return URL.
- Bootstrap trusts only the verified Supabase identity and preserves exact identity error semantics.
- `POST /api/auth/line/logout` validates bearer, Channel, and `sub`, then revokes on LINE.
- The profile logout button directly calls revoke and signs out Supabase only after success.
- No secret or provider token is persisted, logged, returned, or bundled; the only frontend retention is ephemeral page-process memory captured immediately after OAuth.
- Targeted LINE/member tests, focused backend typecheck, Sites, and build are green. At this checkpoint the full-suite residue is limited to the separately approved quality-remediation inventory; full-suite green is claimed only after that plan runs.
- Token-present logout is mock-verified; refreshed/reloaded sessions without a provider token fail closed with `LINE_PROVIDER_TOKEN_REQUIRED`. Live OAuth/token-refresh/revoke behavior remains explicitly unverified until real Channel evidence exists.
