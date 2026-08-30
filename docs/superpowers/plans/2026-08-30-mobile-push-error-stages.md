# Mobile Push Error Stages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 將手機推播開啟失敗辨識為「推播程式註冊失敗」、「手機瀏覽器建立訂閱失敗」或「Supabase 儲存失敗」，並在通知頁顯示對應文字。

**Architecture:** 保留既有推播開啟流程與狀態資料，只在 `PushSubscriptionError` 增加失敗階段，並把 `enablePushNotifications()` 現有步驟分段捕捉錯誤。通知頁只依錯誤階段選擇顯示文字，不更動版面、開關流程或其他功能。

**Tech Stack:** TypeScript、React、Vitest、Testing Library、Supabase JavaScript RPC

**Spec:** 本次對話中使用者提供的「手機推播開啟失敗」修正規格。

## Global Constraints

- 先檢查 `main` 最新程式與相關測試，不要重新實作。
- 不猜測錯誤原因。
- 錯誤只區分為：推播程式註冊失敗、手機瀏覽器建立訂閱失敗、Supabase 儲存失敗。
- 只修改錯誤辨識與顯示，不改通知流程、UI 版面或其他功能。
- 使用測試先重現，再修改程式。
- 不得公開或提交 VAPID 私鑰。

---

### Task 1: Distinguish and Display Push Enable Failure Stages

**Files:**
- Modify: `src/push-subscription.test.ts`
- Modify: `src/push-subscription.ts`
- Modify: `src/__tests__/NotificationsPagePatched.test.tsx`
- Modify: `src/NotificationsPagePatched.tsx`

**Interfaces:**
- Consumes: 既有 `registerPushServiceWorker()`、`PushManager.getSubscription()`、`PushManager.subscribe()`、`savePushSubscription()` 與 `PushStatus`。
- Produces: `PushSubscriptionFailureStage = 'service-worker-registration' | 'browser-subscription' | 'supabase-save'`，以及 `PushSubscriptionError.stage`。

- [ ] **Step 1: Write failing subscription-layer tests**

在 `src/push-subscription.test.ts` 先讓三個既有失敗案例分別要求下列 `stage`：

```ts
expect(error).toMatchObject({ stage: 'service-worker-registration' });
expect(error).toMatchObject({ stage: 'browser-subscription' });
expect(error).toMatchObject({ stage: 'supabase-save' });
```

註冊案例以 `getRegistration()` 或 `register()` 拒絕重現；瀏覽器案例以 `subscribe()` 拒絕重現；儲存案例以 `savePushSubscription()` 拒絕重現。

- [ ] **Step 2: Run the subscription-layer tests and verify RED**

Run:

```bash
npx vitest run src/push-subscription.test.ts
```

Expected: 三個案例因 `PushSubscriptionError` 尚無正確 `stage` 而 FAIL，既有成功流程測試仍不應出現新的非預期錯誤。

- [ ] **Step 3: Write failing notification-page display tests**

在 `src/__tests__/NotificationsPagePatched.test.tsx` 讓 `enablePushNotifications()` 分別拒絕下列錯誤，並要求頁面出現一對一文字：

```ts
new PushSubscriptionError(status, 'service-worker-registration')
// 推播程式註冊失敗

new PushSubscriptionError(status, 'browser-subscription')
// 手機瀏覽器建立訂閱失敗

new PushSubscriptionError(status, 'supabase-save')
// Supabase 儲存失敗
```

- [ ] **Step 4: Run the notification-page tests and verify RED**

Run:

```bash
npx vitest run src/__tests__/NotificationsPagePatched.test.tsx
```

Expected: 三個案例因頁面仍只顯示「手機通知開啟失敗，請稍後再試」而 FAIL。

- [ ] **Step 5: Add the minimal error-stage implementation**

在 `src/push-subscription.ts` 增加：

```ts
export type PushSubscriptionFailureStage =
  | 'service-worker-registration'
  | 'browser-subscription'
  | 'supabase-save';

export class PushSubscriptionError extends Error {
  readonly status: PushStatus;
  readonly stage?: PushSubscriptionFailureStage;

  constructor(status: PushStatus, stage?: PushSubscriptionFailureStage) {
    super('PUSH_SUBSCRIPTION_FAILED');
    this.name = 'PushSubscriptionError';
    this.status = status;
    this.stage = stage;
  }
}
```

將 `enablePushNotifications()` 的既有步驟分成三個錯誤邊界：

```ts
// registerPushServiceWorker() 失敗
failure(resolvedPermission, false, 'service-worker-registration');

// 讀取或建立瀏覽器訂閱、VAPID 公開金鑰轉換、訂閱內容不完整
failure(resolvedPermission, false, 'browser-subscription');

// savePushSubscription() 失敗
failure(resolvedPermission, false, 'supabase-save');
```

未登入、權限拒絕、不支援、關閉通知與登出清理流程維持原行為。

- [ ] **Step 6: Add the minimal page mapping**

在 `src/NotificationsPagePatched.tsx` 的既有開啟失敗處，依 `PushSubscriptionError.stage` 設定對應 notice，並只增加以下三個顯示文字：

```ts
'推播程式註冊失敗'
'手機瀏覽器建立訂閱失敗'
'Supabase 儲存失敗'
```

沒有 `stage` 的既有錯誤維持「手機通知開啟失敗，請稍後再試」。

- [ ] **Step 7: Run focused tests and verify GREEN**

Run:

```bash
npx vitest run src/push-subscription.test.ts src/__tests__/NotificationsPagePatched.test.tsx
```

Expected: 所有 focused tests PASS，0 failures。

- [ ] **Step 8: Run the full unit suite and production build**

Run:

```bash
npm run test:unit
npm run build
```

Expected: 全部測試 PASS；TypeScript 與正式前端建置 exit 0。

- [ ] **Step 9: Commit**

```bash
git add docs/superpowers/plans/2026-08-30-mobile-push-error-stages.md src/push-subscription.test.ts src/push-subscription.ts src/__tests__/NotificationsPagePatched.test.tsx src/NotificationsPagePatched.tsx
git commit -m "fix: distinguish mobile push failure stages"
```
