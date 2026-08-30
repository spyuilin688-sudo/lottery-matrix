# 手機推播第一階段 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 讓 LINE 登入會員在實際手機開啟推播，並讓管理員在「通知管理」對單一會員發送固定測試通知及保存結果。

**Architecture:** PWA 使用瀏覽器 Push API 與 service worker 建立手機訂閱；Supabase 保存每支手機的訂閱與每次發送結果；Supabase Edge Function 持有私密推播金鑰並負責發送；獨立管理後臺沿用既有 Google／AppDeploy 管理員驗證後呼叫 Edge Function。

**Tech Stack:** React 19、TypeScript、Vite、Web Push／Service Worker、Supabase Postgres／RLS／Edge Functions、Vitest、Testing Library、AppDeploy 管理後臺

**Spec:** `docs/superpowers/specs/2026-08-30-mobile-push-notification-design.md`

## Global Constraints

- 維持 LINE 登入，不新增使用者登入方式。
- 測試推播入口只放在管理後臺「通知管理」。
- 測試標題固定為「樂彩 Matrix 測試通知」。
- 測試內容固定為「手機推播已成功啟用」。
- 每次必須先選一名會員，不提供全體會員群發。
- 第一階段不串接開獎、付款、會員到期或 Matrix 狀態自動通知。
- 私密推播金鑰只保存在 Supabase Edge Function secrets。
- 不修改探索、天衍、天工或 Railway 演算法。
- PWA 手機版沿用現有通知頁結構與響應式規則，不重做通知頁。

---

## File Map

### New files

- `由 `supabase migration new mobile_push_notifications` 產生的 migration 檔`：訂閱表、發送紀錄表、RLS 與會員 RPC。
- `supabase/functions/send-test-push/handler.ts`：驗證管理後臺請求、讀取會員有效訂閱、逐支手機發送、保存結果。
- `supabase/functions/send-test-push/handler.test.ts`：Edge Function 行為測試。
- `supabase/functions/send-test-push/index.ts`：Edge Function 啟動入口。
- `supabase/functions/send-test-push/deno.json`：Edge Function 測試與相依設定。
- `src/push-subscription.ts`：Push API、權限、訂閱與停用的單一責任模組。
- `src/push-subscription.test.ts`：PWA 推播訂閱單元測試。
- `public/push-service-worker.js`：接收通知、顯示固定通知、點擊後開啟 PWA。
- `apps/admin/backend/push-notifications.ts`：管理後臺呼叫 Supabase Edge Function。
- `apps/admin/backend/push-notifications.test.ts`：後臺發送介面測試。
- `apps/admin/src/notification-management.ts`：通知管理頁資料型別與 API 呼叫。
- `apps/admin/src/notification-management.test.ts`：通知管理 API 測試。

### Existing files to modify

- `src/member-api.ts`：新增訂閱保存、停用及狀態查詢 RPC 包裝。
- `src/NotificationsPagePatched.tsx`：既有通知操作與實際手機訂閱狀態連動。
- `src/__tests__/NotificationsPagePatched.test.tsx`：權限、成功、拒絕、失敗畫面測試。
- `src/main.tsx`：註冊 `push-service-worker.js`。
- `.env.example`：增加公開推播金鑰欄位。
- `apps/admin/backend/index.ts`：增加會員推播狀態、發送與紀錄 API。
- `apps/admin/backend/index-wiring.test.ts`：驗證新 API 綁定與管理員權限。
- `apps/admin/src/AdminApp.tsx`：在既有「通知管理」加入單一會員測試發送區。
- `apps/admin/src/admin.css`：只補足新區塊所需的響應式樣式。

---

### Task 1: 建立 Supabase 推播資料結構與會員權限

**Files:**
- Create: 執行 `supabase migration new mobile_push_notifications` 後回報的實際檔案路徑
- Test: migration 內建 SQL 驗證及 Supabase advisor

**Interfaces:**
- Produces: `member_push_subscriptions`、`push_delivery_logs`
- Produces RPC: `member_push_subscription_status()`
- Produces RPC: `member_push_subscription_save(p_endpoint text, p_p256dh text, p_auth text)`
- Produces RPC: `member_push_subscription_disable(p_endpoint text)`

- [ ] **Step 1: 用 Supabase CLI 產生正式 migration 檔名**

Run:

```bash
supabase migration new mobile_push_notifications
```

Expected: 在 `supabase/migrations/` 產生含時間戳記的 `*_mobile_push_notifications.sql`。

- [ ] **Step 2: 先寫會失敗的資料庫驗證**

在 migration 末段測試腳本使用交易驗證：未登入角色不可讀取訂閱；登入會員只能讀寫自己的訂閱；相同 `user_id + endpoint` 不可重複；發送紀錄不可由會員端新增。

核心斷言：

```sql
select has_table('public', 'member_push_subscriptions');
select has_table('public', 'push_delivery_logs');
select has_function('public', 'member_push_subscription_status', array[]::text[]);
select has_function('public', 'member_push_subscription_save', array['text','text','text']);
select has_function('public', 'member_push_subscription_disable', array['text']);
```

- [ ] **Step 3: 執行測試確認尚未成立**

Run:

```bash
supabase db reset
```

Expected: FAIL，指出推播資料表或 RPC 尚不存在。

- [ ] **Step 4: 實作最小資料結構**

建立：

```sql
create table public.member_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth_key text not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_success_at timestamptz,
  last_failure_at timestamptz,
  unique (user_id, endpoint)
);

create table public.push_delivery_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  subscription_id uuid references public.member_push_subscriptions(id) on delete set null,
  title text not null,
  body text not null,
  status text not null check (status in ('sent', 'failed')),
  failure_reason text,
  admin_account text not null,
  sent_at timestamptz not null default now()
);
```

兩表啟用 RLS。會員訂閱政策必須同時包含 `to authenticated` 與 `(select auth.uid()) = user_id`；發送紀錄不授權 `anon` 或 `authenticated` 寫入。三個會員 RPC 以 `auth.uid()` 決定會員，不接受前端傳入會員 ID。

- [ ] **Step 5: 驗證資料庫與安全建議**

Run:

```bash
supabase db reset
supabase db advisors
supabase migration list --local
```

Expected: migration 套用成功；無本次新增的 RLS 或函式安全警告。

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations
git commit -m "feat: add mobile push subscription storage"
```

---

### Task 2: 建立 PWA 推播訂閱模組

**Files:**
- Create: `src/push-subscription.ts`
- Create: `src/push-subscription.test.ts`
- Modify: `src/member-api.ts`
- Modify: `.env.example`

**Interfaces:**
- Consumes RPC: `member_push_subscription_status`、`member_push_subscription_save`、`member_push_subscription_disable`
- Produces: `getPushStatus(): Promise<PushStatus>`
- Produces: `enablePushNotifications(publicKey: string): Promise<PushStatus>`
- Produces: `disablePushNotifications(): Promise<PushStatus>`
- `PushStatus = { supported: boolean; permission: NotificationPermission; enabled: boolean }`

- [ ] **Step 1: 寫訂閱模組失敗測試**

測試必須覆蓋：

```ts
it('不支援 Push API 時不建立訂閱', async () => {
  await expect(enablePushNotifications('key')).resolves.toEqual({
    supported: false,
    permission: 'default',
    enabled: false,
  });
});

it('使用者拒絕權限時不保存訂閱', async () => {
  notificationRequestPermission.mockResolvedValue('denied');
  expect((await enablePushNotifications('key')).enabled).toBe(false);
  expect(savePushSubscription).not.toHaveBeenCalled();
});

it('允許後保存 endpoint、p256dh 與 auth', async () => {
  notificationRequestPermission.mockResolvedValue('granted');
  await enablePushNotifications('key');
  expect(savePushSubscription).toHaveBeenCalledWith({
    endpoint: 'https://push.test/device',
    p256dh: 'p256dh-value',
    auth: 'auth-value',
  });
});
```

- [ ] **Step 2: 執行測試確認失敗**

Run:

```bash
npm run test:unit -- src/push-subscription.test.ts
```

Expected: FAIL，因 `push-subscription.ts` 與新 API 尚不存在。

- [ ] **Step 3: 在 member-api 增加 RPC 包裝**

新增明確介面：

```ts
export type MemberPushSubscriptionInput = {
  endpoint: string;
  p256dh: string;
  auth: string;
};

export function fetchPushSubscriptionStatus() {
  return memberRpc<{ enabled: boolean }>('member_push_subscription_status');
}

export function savePushSubscription(input: MemberPushSubscriptionInput) {
  return memberRpc<{ enabled: true }>('member_push_subscription_save', {
    p_endpoint: input.endpoint,
    p_p256dh: input.p256dh,
    p_auth: input.auth,
  });
}

export function disablePushSubscription(endpoint: string) {
  return memberRpc<{ enabled: false }>('member_push_subscription_disable', {
    p_endpoint: endpoint,
  });
}
```

- [ ] **Step 4: 實作 Push API 模組**

`enablePushNotifications` 僅在函式被 UI 點擊事件呼叫後執行 `Notification.requestPermission()`；取得 `serviceWorker.ready` 後呼叫：

```ts
registration.pushManager.subscribe({
  userVisibleOnly: true,
  applicationServerKey: urlBase64ToUint8Array(publicKey),
});
```

將 `subscription.toJSON()` 的 `endpoint`、`keys.p256dh`、`keys.auth` 傳給 `savePushSubscription`。停用時先呼叫 RPC，再呼叫瀏覽器 subscription 的 `unsubscribe()`；任何一步失敗均回傳 `enabled: false` 並向 UI 丟出固定錯誤。

- [ ] **Step 5: 補公開環境變數**

`.env.example` 增加：

```dotenv
VITE_WEB_PUSH_PUBLIC_KEY=
```

不得加入私密推播金鑰。

- [ ] **Step 6: 執行單元測試與型別檢查**

Run:

```bash
npm run test:unit -- src/push-subscription.test.ts src/member-api.test.ts
npm run build:pages
```

Expected: PASS。

- [ ] **Step 7: Commit**

```bash
git add src/push-subscription.ts src/push-subscription.test.ts src/member-api.ts src/member-api.test.ts .env.example
git commit -m "feat: add member push subscription client"
```

---

### Task 3: 註冊 Service Worker 並接收手機通知

**Files:**
- Create: `public/push-service-worker.js`
- Modify: `src/main.tsx`
- Test: `tests/push-service-worker.test.mjs`

**Interfaces:**
- Consumes push payload: `{ title: string; body: string; url: string }`
- Produces notification click target: PWA URL

- [ ] **Step 1: 寫失敗測試**

使用 Node 測試載入 service worker 原始碼並驗證：

```js
assert.match(source, /addEventListener\(["']push["']/);
assert.match(source, /showNotification/);
assert.match(source, /addEventListener\(["']notificationclick["']/);
assert.match(source, /clients\.openWindow/);
```

另在 `src/main.tsx` 測試註冊路徑必須等於 `/push-service-worker.js`。

- [ ] **Step 2: 執行測試確認失敗**

Run:

```bash
node --test tests/push-service-worker.test.mjs
```

Expected: FAIL，因 service worker 尚不存在。

- [ ] **Step 3: 實作接收與點擊**

`push` 事件解析 JSON，並執行：

```js
event.waitUntil(self.registration.showNotification(payload.title, {
  body: payload.body,
  icon: '/icon-192.png',
  data: { url: payload.url || '/' },
}));
```

`notificationclick` 事件先關閉通知，已有 PWA 視窗時聚焦，沒有時以 `clients.openWindow(url)` 開啟。

- [ ] **Step 4: 在 main.tsx 註冊**

只在支援 service worker 時註冊：

```ts
if ('serviceWorker' in navigator) {
  void navigator.serviceWorker.register('/push-service-worker.js');
}
```

- [ ] **Step 5: 執行測試與正式建置**

Run:

```bash
node --test tests/push-service-worker.test.mjs
npm run build:pages
```

Expected: PASS，且 `dist/push-service-worker.js` 存在。

- [ ] **Step 6: Commit**

```bash
git add public/push-service-worker.js src/main.tsx tests/push-service-worker.test.mjs
git commit -m "feat: receive mobile push notifications"
```

---

### Task 4: 將既有通知頁開關連到實際手機訂閱

**Files:**
- Modify: `src/NotificationsPagePatched.tsx`
- Modify: `src/__tests__/NotificationsPagePatched.test.tsx`
- Modify: `src/responsive-feature-pages.css`

**Interfaces:**
- Consumes: `getPushStatus`、`enablePushNotifications`、`disablePushNotifications`
- Visible states: 未開啟、開啟中、已開啟、拒絕、此手機不支援、開啟失敗

- [ ] **Step 1: 補 UI 失敗測試**

測試既有「系統通知」開關的使用者操作：

```ts
it('點擊開啟後才詢問手機權限', async () => {
  render(<NotificationsPagePatched onNavigate={vi.fn()} />);
  expect(enablePushNotifications).not.toHaveBeenCalled();
  fireEvent.click(within(systemRow).getByRole('button', { name: '開啟手機通知' }));
  await waitFor(() => expect(enablePushNotifications).toHaveBeenCalledTimes(1));
});

it('拒絕權限時顯示未開啟', async () => {
  enablePushNotifications.mockResolvedValue({
    supported: true, permission: 'denied', enabled: false,
  });
  fireEvent.click(within(systemRow).getByRole('button', { name: '開啟手機通知' }));
  expect(await screen.findByText('手機通知未開啟')).toBeVisible();
});
```

另測試成功、裝置不支援、保存失敗及關閉通知。

- [ ] **Step 2: 執行測試確認失敗**

Run:

```bash
npm run test:unit -- src/__tests__/NotificationsPagePatched.test.tsx
```

Expected: FAIL，因通知頁尚未呼叫實際訂閱模組。

- [ ] **Step 3: 實作最小 UI 連動**

沿用現有通知頁卡片與開關位置，不新增新頁面。頁面載入只查詢狀態，不自動要求權限。使用者點擊後才呼叫：

```ts
await enablePushNotifications(import.meta.env.VITE_WEB_PUSH_PUBLIC_KEY);
```

操作進行中停用開關，避免連點。只有訂閱保存成功時顯示已開啟；拒絕、不支援或失敗時維持未開啟並顯示對應固定文字。

- [ ] **Step 4: 只補必要響應式樣式**

新增狀態文字時沿用現有字級、間距與卡片寬度；390px 畫面不得水平捲動，不使用固定寬度或強制覆寫整個通知頁。

- [ ] **Step 5: 執行通知頁與手機寬度測試**

Run:

```bash
npm run test:unit -- src/__tests__/NotificationsPagePatched.test.tsx
node --test tests/quick-settings-notification-responsive.test.mjs tests/notification-status-layout.test.mjs
npm run build:pages
```

Expected: PASS。

- [ ] **Step 6: Commit**

```bash
git add src/NotificationsPagePatched.tsx src/__tests__/NotificationsPagePatched.test.tsx src/responsive-feature-pages.css
git commit -m "feat: connect notification toggle to mobile push"
```

---

### Task 5: 建立 Supabase 測試推播 Edge Function

**Files:**
- Create: `supabase/functions/send-test-push/handler.ts`
- Create: `supabase/functions/send-test-push/handler.test.ts`
- Create: `supabase/functions/send-test-push/index.ts`
- Create: `supabase/functions/send-test-push/deno.json`

**Interfaces:**
- Consumes body: `{ userId: string; adminAccount: string }`
- Produces: `{ sent: number; failed: number }`
- Fixed payload: `{ title: '樂彩 Matrix 測試通知', body: '手機推播已成功啟用', url: '/' }`

- [ ] **Step 1: 寫 Edge Function 失敗測試**

測試：

```ts
Deno.test('未提供會員時回傳 400', async () => {
  const response = await handler(request({}));
  assertEquals(response.status, 400);
});

Deno.test('沒有有效訂閱時回傳 409', async () => {
  listSubscriptions.stubResolvedValue([]);
  const response = await handler(request({ userId: 'member-1', adminAccount: 'admin@test' }));
  assertEquals(response.status, 409);
});

Deno.test('逐筆保存成功與失敗結果', async () => {
  listSubscriptions.stubResolvedValue([subscriptionA, subscriptionB]);
  sendPush.stubResolvedValueOnce(true).stubRejectedValueOnce(new Error('expired'));
  const response = await handler(request({ userId: 'member-1', adminAccount: 'admin@test' }));
  assertEquals(await response.json(), { sent: 1, failed: 1 });
});
```

- [ ] **Step 2: 執行測試確認失敗**

Run:

```bash
deno test supabase/functions/send-test-push/handler.test.ts
```

Expected: FAIL，因 handler 尚不存在。

- [ ] **Step 3: 實作固定測試推播**

handler 必須：

1. 驗證 `Authorization` 為 Supabase service role 呼叫。
2. 驗證 `userId` 與 `adminAccount` 非空。
3. 查詢該會員所有 `enabled = true` 訂閱。
4. 以 Supabase secret 中的 `WEB_PUSH_PUBLIC_KEY`、`WEB_PUSH_PRIVATE_KEY`、`WEB_PUSH_SUBJECT` 簽署推播。
5. 固定發送標題與內容。
6. 每支手機各新增一筆 `push_delivery_logs`。
7. 成功時更新 `last_success_at`；失效端點失敗時更新 `enabled = false` 與 `last_failure_at`。
8. 回傳成功及失敗數量。

- [ ] **Step 4: 建立 Edge Function 入口**

`index.ts` 只負責建立 Supabase client、讀取 secrets、注入 handler 並執行 `Deno.serve`，商業邏輯留在 `handler.ts` 供測試。

- [ ] **Step 5: 執行 Edge Function 測試**

Run:

```bash
deno test supabase/functions/send-test-push/handler.test.ts
```

Expected: PASS。

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/send-test-push
git commit -m "feat: add test push sender"
```

---

### Task 6: 串接獨立管理後臺發送 API

**Files:**
- Create: `apps/admin/backend/push-notifications.ts`
- Create: `apps/admin/backend/push-notifications.test.ts`
- Modify: `apps/admin/backend/index.ts`
- Modify: `apps/admin/backend/index-wiring.test.ts`

**Interfaces:**
- Produces: `listMemberPushStatus(): Promise<MemberPushStatus[]>`
- Produces: `sendMemberTestPush(userId: string, adminAccount: string): Promise<{ sent: number; failed: number }>`
- Routes:
  - `GET /api/push-members`
  - `POST /api/push-members/:id/test`
  - `GET /api/push-delivery-logs`

- [ ] **Step 1: 寫後臺 API 失敗測試**

測試必須確認：

```ts
it('未選會員不呼叫發送函式', async () => {
  await expect(api.sendMemberTestPush('', 'admin@test')).rejects.toThrow('MEMBER_REQUIRED');
  expect(fetcher).not.toHaveBeenCalled();
});

it('只傳送固定內容所需的會員與管理員身分', async () => {
  await api.sendMemberTestPush('member-1', 'admin@test');
  expect(fetcher).toHaveBeenCalledWith(
    expect.stringContaining('/functions/v1/send-test-push'),
    expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ userId: 'member-1', adminAccount: 'admin@test' }),
    }),
  );
});
```

路由測試另確認三條 API 都有 `requireAuth()`，並沿用現有管理後臺的查看／編輯權限。

- [ ] **Step 2: 執行測試確認失敗**

Run:

```bash
cd apps/admin
npm test -- backend/push-notifications.test.ts backend/index-wiring.test.ts
```

Expected: FAIL，因 API 尚未建立。

- [ ] **Step 3: 實作後臺 Supabase 呼叫**

`push-notifications.ts` 使用既有 `createSupabaseTransport`：

- 查詢會員暱稱、LINE 頭貼及是否存在有效訂閱。
- 呼叫 `/functions/v1/send-test-push` 時只傳 `userId` 與已驗證管理員帳號。
- 查詢 `push_delivery_logs` 並依 `sent_at desc` 回傳。

- [ ] **Step 4: 註冊受保護路由**

在 `apps/admin/backend/index.ts`：

```ts
'GET /api/push-members': [requireAuth(), guard('view'), ...],
'POST /api/push-members/:id/test': [requireAuth(), guard('edit'), ...],
'GET /api/push-delivery-logs': [requireAuth(), guard('view'), ...],
```

發送路由從 `getAdmin(ctx)` 取得管理員帳號，不接受前端自行傳入管理員帳號。

- [ ] **Step 5: 執行後臺測試**

Run:

```bash
cd apps/admin
npm test -- backend/push-notifications.test.ts backend/index-wiring.test.ts backend/admin-auth.test.ts
npm run build
```

Expected: PASS。

- [ ] **Step 6: Commit**

```bash
git add apps/admin/backend
git commit -m "feat: add protected admin test push API"
```

---

### Task 7: 在「通知管理」加入單一會員測試發送區

**Files:**
- Create: `apps/admin/src/notification-management.ts`
- Create: `apps/admin/src/notification-management.test.ts`
- Modify: `apps/admin/src/AdminApp.tsx`
- Modify: `apps/admin/src/admin.css`

**Interfaces:**
- Consumes: `GET /api/push-members`、`POST /api/push-members/:id/test`、`GET /api/push-delivery-logs`
- Displays: 暱稱、LINE 頭貼、推播啟用狀態、固定通知內容、發送結果、發送時間、失敗原因

- [ ] **Step 1: 寫通知管理資料層失敗測試**

```ts
it('沒有選擇會員時禁止發送', async () => {
  await expect(sendTestPush('')).rejects.toThrow('請先選擇會員');
});

it('選擇會員後只呼叫該會員路徑', async () => {
  await sendTestPush('member-1');
  expect(fetcher).toHaveBeenCalledWith('/api/push-members/member-1/test', expect.objectContaining({
    method: 'POST',
  }));
});
```

- [ ] **Step 2: 寫通知管理畫面失敗測試**

在既有 AdminApp 測試加入：

- 未選會員時「發送測試推播」停用。
- 沒有有效訂閱時按鈕停用。
- 選擇有效會員後按鈕啟用。
- 顯示固定標題與內容，沒有自訂輸入框。
- 發送後顯示成功數與失敗數。
- 紀錄列表顯示時間、結果與失敗原因。
- 不存在全體會員群發按鈕。

- [ ] **Step 3: 執行測試確認失敗**

Run:

```bash
cd apps/admin
npm test -- src/notification-management.test.ts src/admin-operations.test.ts
```

Expected: FAIL，因通知管理操作尚未建立。

- [ ] **Step 4: 實作通知管理資料層與 UI**

在既有「通知管理」內容區增加：

1. 單一會員選擇控制。
2. 選定會員的暱稱、LINE 頭貼與「已開啟／未開啟」狀態。
3. 唯讀固定內容：
   - 樂彩 Matrix 測試通知
   - 手機推播已成功啟用
4. 「發送測試推播」按鈕。
5. 發送紀錄表格。

不得加入自訂文字、群發或排程控制。

- [ ] **Step 5: 補管理後臺響應式樣式**

手機寬度下會員資料、固定內容與發送按鈕改為單欄；桌面沿用現有後臺卡片與表格樣式。不得用固定寬度造成水平捲動。

- [ ] **Step 6: 執行管理後臺完整測試與建置**

Run:

```bash
cd apps/admin
npm test
npm run build
```

Expected: PASS。

- [ ] **Step 7: Commit**

```bash
git add apps/admin/src
git commit -m "feat: add admin test push controls"
```

---

### Task 8: 整合驗證與實際手機驗收

**Files:**
- Modify only if a verified defect is found in Tasks 1–7.

**Interfaces:**
- End-to-end flow: LINE 登入 → 手機開啟通知 → Supabase 保存 → 後臺選會員 → 發送 → 手機收到 → 紀錄保存

- [ ] **Step 1: 執行全部自動測試**

Run:

```bash
npm run test:unit
npm run build:pages
node --test tests/push-service-worker.test.mjs
cd apps/admin && npm test && npm run build
deno test supabase/functions/send-test-push/handler.test.ts
```

Expected: 全部 PASS。

- [ ] **Step 2: 設定部署 secrets**

Supabase Edge Function secrets：

```text
WEB_PUSH_PUBLIC_KEY
WEB_PUSH_PRIVATE_KEY
WEB_PUSH_SUBJECT
```

Cloudflare Pages 公開環境變數：

```text
VITE_WEB_PUSH_PUBLIC_KEY
```

公開金鑰兩處必須相同；私密金鑰不得出現在 Cloudflare Pages 或 GitHub。

- [ ] **Step 3: 部署 Supabase migration 與 Edge Function**

依 Supabase CLI `--help` 顯示的目前版本命令部署；部署後再次執行 database advisors，確認新表與函式沒有安全警告。

- [ ] **Step 4: 部署 PWA 與獨立管理後臺測試版本**

先部署測試版本，不直接宣稱正式完成。記錄 PWA 與管理後臺版本號。

- [ ] **Step 5: 使用實際 Android 手機驗收**

逐項確認：

1. 使用 LINE 登入。
2. 打開通知頁時不自動跳出權限視窗。
3. 手動點擊開啟通知。
4. Android 顯示權限詢問。
5. 同意後畫面顯示已開啟。
6. Supabase 可查到該手機有效訂閱。
7. 管理後臺「通知管理」可選到該會員。
8. 顯示正確暱稱、LINE 頭貼及已開啟狀態。
9. 按下「發送測試推播」。
10. 手機收到「樂彩 Matrix 測試通知」。
11. 點擊通知可開啟 PWA。
12. 後臺可查到發送時間及成功結果。
13. 關閉手機通知後再次測試，該手機不再接收。

- [ ] **Step 6: 驗證第一階段沒有越界功能**

確認沒有：

- 全體群發
- 自訂通知文字
- 開獎自動通知
- 付款、續訂或到期自動通知
- Matrix 狀態自動通知
- AppDeploy 使用者登入

- [ ] **Step 7: Final commit only when verification changed files**

若整合驗證修正了缺陷：

```bash
git status --short
# 只加入本計畫於 Tasks 1–7 已列出的缺陷修正檔案，再提交：
git commit -m "fix: complete mobile push verification"
```

若沒有修改，不建立空提交。
