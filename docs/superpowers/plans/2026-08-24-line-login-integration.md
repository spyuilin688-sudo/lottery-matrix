# 樂彩 Matrix LINE Login Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 將已設定完成的 Supabase `custom:line` Provider 接入現有 React/PWA，依 `public/assets/lottery/functions/LINE登入介面.png` 顯示未登入畫面，LINE 授權成功後建立/取得 `members` 紀錄並進入既有樂彩 Matrix，現有「登出」按鈕改為清除 Supabase session。

**Architecture:** 在現有 `App.tsx` 與 `Prototype` 之間加入單一 Auth Gate；Gate 只管理 Supabase session、LINE OAuth 與 member bootstrap，不改首頁或其他功能流程。後端新增 `POST /api/member/bootstrap`，只信任 `/auth/v1/user` 驗證後的 `custom:line` identity，沿用現有 Supabase bearer、service-role REST 寫入與既有會員資料表。

**Tech Stack:** React 19、TypeScript、Vite、Supabase JS 2.112.x、AppDeploy router、Vitest、Testing Library。

**Spec:** `docs/superpowers/specs/2026-08-24-line-login-api-design.md`

## Global Constraints

- Repository：`spyuilin688-sudo/lottery-matrix`；正式 Branch：`main`。
- 基準必須是執行前最新 `main`。
- Supabase provider identifier 固定 `custom:line`。
- 正式站 return URL 使用目前同源網址；不接受任意外部 `returnTo`。
- LINE Channel ID / Channel secret 不寫入 GitHub、前端 bundle 或日誌。
- `line_user_id` 只使用 Supabase 已驗證 `custom:line` identity 的 `provider_id`。
- 新會員 bootstrap 只寫 `auth_user_id` 與 `line_user_id`；不建立方案、付款、到期日、推薦碼或通知資料。
- 未登入介面以 `public/assets/lottery/functions/LINE登入介面.png` 為正式視覺依據；只呈現圖中已有的「樂彩 Matrix」「SMART MATRIX · ENJOY LOTTERY」「使用 LINE 登入」「登入即表示同意」「服務條款」「隱私權政策」。
- 不修改首頁、Matrix、通知、付款或其他未指定功能。
- 不新增第二套 auth token 或 session。

---

### Task 1: LINE OAuth helper 與 member bootstrap client

**Files:**
- Create: `src/auth/line-auth.ts`
- Create: `src/auth/__tests__/line-auth.test.ts`
- Modify: `src/member-api.ts`
- Modify: `src/member-api.test.ts`

**Interfaces:**
- Produces: `signInWithLine(redirectTo?: string): Promise<void>`
- Produces: `signOutFromMatrix(): Promise<void>`
- Produces: `bootstrapMember(): Promise<{ memberId: string; lineUserId: string }>`

- [ ] **Step 1: Write failing auth helper tests**

```ts
it('starts custom:line OAuth with the provided same-origin return URL', async () => {
  const signInWithOAuth = vi.fn().mockResolvedValue({ data: {}, error: null });
  await signInWithLine('https://matrixlottery.idv.tw', { auth: { signInWithOAuth } } as never);
  expect(signInWithOAuth).toHaveBeenCalledWith({
    provider: 'custom:line',
    options: { redirectTo: 'https://matrixlottery.idv.tw' },
  });
});

it('signs out the Supabase session', async () => {
  const signOut = vi.fn().mockResolvedValue({ error: null });
  await signOutFromMatrix({ auth: { signOut } } as never);
  expect(signOut).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: Run targeted tests and verify RED**

Run: `npx vitest run src/auth/__tests__/line-auth.test.ts src/member-api.test.ts`
Expected: FAIL because `line-auth.ts` and `bootstrapMember` do not exist.

- [ ] **Step 3: Implement minimal auth helper and client method**

```ts
export async function signInWithLine(redirectTo = window.location.origin, client = getSupabaseClient()) {
  const { error } = await client.auth.signInWithOAuth({
    provider: 'custom:line',
    options: { redirectTo },
  });
  if (error) throw error;
}

export async function signOutFromMatrix(client = getSupabaseClient()) {
  const { error } = await client.auth.signOut();
  if (error) throw error;
}
```

Add `bootstrapMember()` in `src/member-api.ts` using `matrixApiFetch('/api/member/bootstrap', { method: 'POST' })`.

- [ ] **Step 4: Re-run targeted tests and verify GREEN**

Run: `npx vitest run src/auth/__tests__/line-auth.test.ts src/member-api.test.ts`
Expected: PASS.

---

### Task 2: Backend member bootstrap service

**Files:**
- Create: `backend/member-bootstrap.ts`
- Create: `backend/member-bootstrap.test.ts`

**Interfaces:**
- Produces: `createMemberBootstrap(loadConfig, fetcher?)`
- Produces: `bootstrap(authorization?: string): Promise<{ memberId: string; lineUserId: string }>`
- Produces error codes: `AUTH_REQUIRED`, `LINE_IDENTITY_REQUIRED`, `LINE_IDENTITY_CONFLICT`, `MEMBER_BOOTSTRAP_FAILED`.

- [ ] **Step 1: Write failing service tests**

Cover exactly these cases:

```ts
it('creates a member from the verified custom:line provider_id', async () => { /* auth user -> no rows -> insert */ });
it('returns the existing member when auth_user_id and line_user_id already match', async () => { /* idempotent */ });
it('fills an empty line_user_id for the same auth_user_id', async () => { /* patch */ });
it('returns 409 when the auth user is already bound to another line_user_id', async () => { /* conflict */ });
it('returns 409 when line_user_id belongs to another auth_user_id', async () => { /* conflict */ });
it('rejects a Supabase user without custom:line identity', async () => { /* 403 */ });
```

- [ ] **Step 2: Run service test and verify RED**

Run: `npx vitest run backend/member-bootstrap.test.ts`
Expected: FAIL because service does not exist.

- [ ] **Step 3: Implement the service**

Implementation rules:

```ts
const authUser = await fetcher(`${config.url}/auth/v1/user`, {
  headers: { apikey: config.anonKey, Authorization: `Bearer ${token}` },
});
```

Find identity where `provider === 'custom:line'`; read `provider_id`; query `members` using service-role headers. Existing matching record is returned unchanged. Empty `line_user_id` is patched. A different binding or unique collision maps to HTTP 409 semantics. New row body contains only `{ auth_user_id, line_user_id }`.

- [ ] **Step 4: Re-run service test and verify GREEN**

Run: `npx vitest run backend/member-bootstrap.test.ts`
Expected: PASS.

---

### Task 3: Register `POST /api/member/bootstrap`

**Files:**
- Create: `backend/member-bootstrap-routes.ts`
- Create: `backend/member-bootstrap-routes.test.ts`
- Modify: `backend/member-route-handlers.ts`
- Modify: `backend/member-route-registration.test.ts`
- Modify: `backend/index.ts`

**Interfaces:**
- Consumes: `createMemberBootstrap(...).bootstrap(authorization)`
- Produces: `POST /api/member/bootstrap`
- Success body: `{ memberId, lineUserId }`

- [ ] **Step 1: Write failing route/registration tests**

```ts
expect(Object.keys(routes)).toContain('POST /api/member/bootstrap');
```

Verify the handler forwards the authorization header and preserves service status/code.

- [ ] **Step 2: Run route tests and verify RED**

Run: `npx vitest run backend/member-bootstrap-routes.test.ts backend/member-route-registration.test.ts`
Expected: FAIL because bootstrap route is not registered.

- [ ] **Step 3: Implement minimal route wiring**

`member-bootstrap-routes.ts` converts known bootstrap errors to their exact status/code and maps unknown upstream Supabase failures to `502 MEMBER_BOOTSTRAP_FAILED`.

Extend `createMemberRouteHandlers` dependency shape with:

```ts
bootstrapPost(input: { authorization?: string }): Promise<RouteResult>;
```

and add:

```ts
'POST /api/member/bootstrap': [async ({ event }) => {
  const response = await dependencies.bootstrapPost({ authorization: dependencies.authorizationHeader(event) });
  return dependencies.json(response.body, response.status);
}],
```

Instantiate service/routes in `backend/index.ts` with the existing `loadMatrixSupabaseConfig` and add them to `memberRouteHandlers`.

- [ ] **Step 4: Re-run route tests and verify GREEN**

Run: `npx vitest run backend/member-bootstrap-routes.test.ts backend/member-route-registration.test.ts`
Expected: PASS.

---

### Task 4: Auth Gate 與正式 LINE 登入畫面

**Files:**
- Create: `src/auth/LineAuthGate.tsx`
- Create: `src/auth/line-login.css`
- Create: `src/auth/__tests__/LineAuthGate.test.tsx`
- Modify: `src/App.tsx`
- Modify: `src/__tests__/app-production-shell.test.tsx`

**Interfaces:**
- Consumes: Supabase `getSession()` / `onAuthStateChange()`
- Consumes: `signInWithLine()` / `bootstrapMember()`
- Produces: unauthenticated login screen or authenticated children, never both.

- [ ] **Step 1: Write failing Auth Gate tests**

Required behavior:

```ts
it('shows the LINE login interface when no Supabase session exists', async () => {
  expect(await screen.findByRole('button', { name: '使用 LINE 登入' })).toBeInTheDocument();
});

it('bootstraps a LINE member before rendering authenticated children', async () => {
  expect(bootstrapMember).toHaveBeenCalledTimes(1);
  expect(await screen.findByText('authenticated-child')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run Auth Gate tests and verify RED**

Run: `npx vitest run src/auth/__tests__/LineAuthGate.test.tsx src/__tests__/app-production-shell.test.tsx`
Expected: FAIL because Auth Gate does not exist and App renders `Prototype` directly.

- [ ] **Step 3: Implement the confirmed screen and gate**

`LineAuthGate` owns only auth/session state. During initial session check it renders no duplicate app shell. Without a session it renders the reference screen; the CTA calls `signInWithLine(window.location.origin)`. With a session it waits for `bootstrapMember()` before rendering children. Subscribe to `onAuthStateChange()` so sign-out returns to the same login screen.

The UI must use only the confirmed reference content:

```text
樂彩 Matrix
SMART MATRIX · ENJOY LOTTERY
使用 LINE 登入
登入即表示同意
服務條款
隱私權政策
```

Use `public/assets/lottery/functions/LINE登入介面.png` as the formal visual source and reproduce its black/gold full-screen presentation with the green LINE CTA. No bottom navigation is shown before login.

Wrap the non-admin PWA in `App.tsx`:

```tsx
<LineAuthGate>
  <MobileDeviceProvider>
    <KeyboardProvider>
      <Prototype />
    </KeyboardProvider>
  </MobileDeviceProvider>
</LineAuthGate>
```

- [ ] **Step 4: Re-run Auth Gate tests and verify GREEN**

Run: `npx vitest run src/auth/__tests__/LineAuthGate.test.tsx src/__tests__/app-production-shell.test.tsx`
Expected: PASS.

---

### Task 5: Connect existing profile logout button

**Files:**
- Modify: `src/FeaturePages.tsx`
- Modify: `src/__tests__/MemberProfilePage.test.tsx`

**Interfaces:**
- Consumes: `signOutFromMatrix()`
- Existing UI remains: `.profile-logout` with text `登出`.

- [ ] **Step 1: Add failing logout interaction test**

Click the existing `登出` button and assert the auth helper was called once. Do not change the button text, location, surrounding profile card, or other profile behavior.

- [ ] **Step 2: Run test and verify RED**

Run: `npx vitest run src/__tests__/MemberProfilePage.test.tsx`
Expected: FAIL because the button currently has no logout action.

- [ ] **Step 3: Add the existing button action**

```tsx
<button type="button" className="profile-logout" onClick={() => void signOutFromMatrix()}>登出</button>
```

- [ ] **Step 4: Run test and verify GREEN**

Run: `npx vitest run src/__tests__/MemberProfilePage.test.tsx`
Expected: PASS.

---

### Task 6: Full verification and formal synchronization

**Files:** No unrelated code changes.

- [ ] **Step 1: Run targeted LINE login suite**

Run:

```bash
npx vitest run \
  src/auth/__tests__/line-auth.test.ts \
  src/auth/__tests__/LineAuthGate.test.tsx \
  src/member-api.test.ts \
  src/__tests__/MemberProfilePage.test.tsx \
  backend/member-bootstrap.test.ts \
  backend/member-bootstrap-routes.test.ts \
  backend/member-route-registration.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run project unit tests**

Run: `npm run test:unit`
Expected: PASS.

- [ ] **Step 3: Build production PWA**

Run: `npm run build`
Expected: `tsc` and Vite build complete successfully.

- [ ] **Step 4: Verify directly related mobile UI**

Check login screen at mobile widths 360 / 375 / 390 px: no horizontal overflow; green LINE CTA remains visible; legal text does not overlap; no bottom navigation appears before login.

- [ ] **Step 5: Sync tested commit to `main`**

Fast-forward the final tested commit to `main`; do not force-replace newer upstream work. Confirm final HEAD.

- [ ] **Step 6: Update current formal deployment and verify**

Deploy the tested `main` through the existing formal deployment path (not Vercel), then verify `https://matrixlottery.idv.tw` loads the LINE login screen when signed out and begins the configured LINE OAuth flow when the CTA is pressed.
