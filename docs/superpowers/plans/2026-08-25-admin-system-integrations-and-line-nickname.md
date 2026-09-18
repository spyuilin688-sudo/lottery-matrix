# 管理後台服務控制台與 LINE 暱稱同步 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在正式管理後台自動顯示 LINE 暱稱，並把系統設定升級為安全、唯讀、可個別檢查與同步的完整服務控制台。

**Architecture:** Supabase 將 LINE 暱稱正規化保存於 `public.members.line_display_name`，Auth identity trigger 負責登入與身分更新時同步；管理後台後端只回傳安全的服務位置、健康狀態與彙總統計，並以管理員權限保護手動同步。前端沿用既有狀態卡與確認對話框，新增分組資訊、複製、個別檢查與暱稱同步操作。

**Tech Stack:** PostgreSQL/Supabase Auth、TypeScript、React、Vitest、AppDeploy、GitHub/Vercel。

**Spec:** `docs/superpowers/specs/2026-08-25-admin-system-integrations-and-line-nickname-design.md`

## Global Constraints

- API 網址只能顯示與複製，不能在管理後台修改。
- 不顯示 Supabase service role、anon key、LINE Channel Secret 或任何權杖。
- LINE User ID 保留作內部識別，但不顯示於用戶管理與訂閱管理。
- 只有超級管理員可以執行 LINE 暱稱同步；其他角色只能查看及執行安全的唯讀檢查。
- 不新增或恢復演算法自動排程，也不新增會執行演算法的系統設定按鈕。
- 所有資料寫入必須冪等、可重試並留下不含敏感資訊的審計紀錄。
- 每一個 production behavior 都先以失敗測試證明需求，再實作至測試通過。

---

### Task 1: Supabase LINE 暱稱欄位與自動同步

**Files:**
- Create: `supabase/migrations/<generated>_sync_line_display_names.sql`
- Modify database: `public.members`, `private.sync_line_member_from_identity()`

**Interfaces:**
- Consumes: `auth.identities(user_id, provider, provider_id, identity_data, created_at)`
- Produces: `public.members.line_display_name text`，且 LINE identity insert/update 後自動同步。

- [ ] **Step 1: 建立 RED 資料測試**

在交易內挑選既有 LINE identity，確認欄位尚不存在或暱稱尚未同步；預期查詢回傳失敗／缺少欄位。基準查詢：

```sql
select count(*) as missing
from auth.identities i
join public.members m on m.auth_user_id = i.user_id
where i.provider = 'custom:line'
  and nullif(btrim(i.identity_data->>'name'), '') is not null
  and m.line_display_name is distinct from btrim(i.identity_data->>'name');
```

- [ ] **Step 2: 執行 RED 並確認因 `line_display_name` 不存在而失敗**

使用 Supabase SQL 執行上式；預期 PostgreSQL 回報 `column m.line_display_name does not exist`。

- [ ] **Step 3: 產生並套用 migration**

Migration 必須：

```sql
alter table public.members
  add column if not exists line_display_name text;

create or replace function private.sync_line_member_from_identity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  display_name text := nullif(btrim(new.identity_data->>'name'), '');
begin
  if new.provider is distinct from 'custom:line'
     or nullif(btrim(new.provider_id), '') is null then
    return new;
  end if;

  update public.members as member
  set line_user_id = new.provider_id,
      line_display_name = coalesce(display_name, member.line_display_name)
  where member.auth_user_id = new.user_id
    and not exists (
      select 1 from public.members existing
      where existing.line_user_id = new.provider_id
        and existing.auth_user_id <> new.user_id
    );

  insert into public.members
    (auth_user_id, line_user_id, line_display_name, registered_at)
  select new.user_id, new.provider_id, display_name, coalesce(new.created_at, now())
  where not exists (
    select 1 from public.members member
    where member.auth_user_id = new.user_id
       or member.line_user_id = new.provider_id
  )
  on conflict do nothing;

  return new;
exception when others then
  raise warning 'LINE member synchronization failed for auth user %: %',
    new.user_id, sqlerrm;
  return new;
end;
$$;

revoke all on function private.sync_line_member_from_identity()
  from public, anon, authenticated;
```

同一 migration 回填 `identity_data->>'name'` 至既有 LINE members。

- [ ] **Step 4: 執行 GREEN 驗證**

驗證缺少同步筆數為 `0`，並在 transaction 中暫時清空一筆暱稱、更新 identity 觸發器、確認暱稱復原後 rollback。再確認 anon／authenticated 的 schema usage 與 function execute 均為 false。

- [ ] **Step 5: 執行 Supabase security/performance advisors**

確認新增欄位與私有觸發器沒有新增 WARN／ERROR；既有且不相關的 advisor 項目不在本任務擴大修正。

- [ ] **Step 6: 提交 migration**

Commit message：`feat: sync LINE display names to members`。

### Task 2: 用戶與訂閱 API 回傳 LINE 暱稱

**Files:**
- Modify: AppDeploy `matrix-sanqwn/backend/admin-data.test.ts`
- Modify: AppDeploy `matrix-sanqwn/backend/admin-data.ts`

**Interfaces:**
- Consumes: `members.line_display_name`
- Produces: users/subscriptions item property `lineDisplayName: string | null`

- [ ] **Step 1: 新增 RED 測試**

在 users 與 subscriptions mapping fixture 加入 `line_display_name: '測試暱稱'`，斷言：

```ts
expect(result.items[0]).toMatchObject({
  lineDisplayName: '測試暱稱',
});
expect(result.items[0]).not.toHaveProperty('lineUserId');
```

- [ ] **Step 2: 執行指定 Vitest 並確認失敗**

Run: `npm test -- backend/admin-data.test.ts`  
Expected: FAIL，原因是回應仍只有 `lineUserId`。

- [ ] **Step 3: 修改最小映射**

users/subscriptions select 加入 `line_display_name`；map 改為：

```ts
lineDisplayName: row.line_display_name,
```

並移除對外的 `lineUserId` 屬性。

- [ ] **Step 4: 重跑測試**

Run: `npm test -- backend/admin-data.test.ts`  
Expected: PASS。

### Task 3: 安全服務狀態與同步統計

**Files:**
- Modify: AppDeploy `matrix-sanqwn/backend/connection-status.test.ts`
- Modify: AppDeploy `matrix-sanqwn/backend/connection-status.ts`
- Modify: AppDeploy `matrix-sanqwn/backend/index.ts`

**Interfaces:**
- Produces:
  - `GET /api/system/status` → `{ checkedAt, summary, groups, sync }`
  - `POST /api/system/status/:id/retry` → one safe status item
- Status item fields: `id,name,description,url?,ok,checkedAt,responseMs,retryable?,actionLabel?,error?,detail?`
- Sync fields: `authUsers,members,lineIdentities,lineNamesSynced,lineNamesMissing,notificationSettings,lastNotificationUpdate`

- [ ] **Step 1: 新增 RED 測試**

測試服務項目包含公開 URL、會員與通知 API 的預期未授權回應視為路由正常、同步統計正確，且序列化結果不包含 `serviceRoleKey`、`anonKey`、`channelSecret`、`token`。

- [ ] **Step 2: 執行 RED**

Run: `npm test -- backend/connection-status.test.ts`  
Expected: FAIL，因現有 get() 只有扁平 items，沒有網址分組與同步統計。

- [ ] **Step 3: 實作安全服務登錄與統計**

保留既有核心檢查，增加唯讀位置與分組；用 Supabase service transport 只做 count/head 或 limit 查詢。受保護端點的 checker 接受 `401`／`403`，拒絕 `5xx`。回傳前以明確 DTO 建構，禁止展開 config/secrets 物件。

- [ ] **Step 4: 執行 GREEN 與回歸測試**

Run: `npm test -- backend/connection-status.test.ts backend/admin-auth.test.ts`  
Expected: PASS。

### Task 4: 超級管理員手動同步 LINE 暱稱

**Files:**
- Create: AppDeploy `matrix-sanqwn/backend/line-profile-sync.ts`
- Create: AppDeploy `matrix-sanqwn/backend/line-profile-sync.test.ts`
- Modify: AppDeploy `matrix-sanqwn/backend/index.ts`
- Modify: AppDeploy `matrix-sanqwn/backend/admin-auth.ts` only if an existing role guard cannot be reused

**Interfaces:**
- Produces: `POST /api/system/line-profile-sync`
- Result: `{ checked: number, updated: number, skipped: number, errors: number }`

- [ ] **Step 1: 新增 RED 測試**

涵蓋分頁 Auth users、只處理 `custom:line`、去除暱稱空白、以 auth user UUID 更新 member、重跑不重複、非超級管理員回傳 403，以及結果不含 LINE User ID。

- [ ] **Step 2: 執行 RED**

Run: `npm test -- backend/line-profile-sync.test.ts`  
Expected: FAIL，因 module/route 尚不存在。

- [ ] **Step 3: 實作最小同步服務**

使用後端 service role 呼叫 `/auth/v1/admin/users?page=N&per_page=1000`，抽取 `identities[].provider === 'custom:line'` 的 `identity_data.name`，依 `auth_user_id` 更新 `members.line_display_name`。只回傳彙總；完成後以既有 audit writer 記錄「同步 LINE 暱稱」與彙總數。

- [ ] **Step 4: 接上路由與權限**

路由先執行既有管理員驗證，再要求 `role === '超級管理員'`。不接受 URL、密鑰或 user ID 作為 request body。

- [ ] **Step 5: 執行 GREEN**

Run: `npm test -- backend/line-profile-sync.test.ts backend/admin-auth.test.ts`  
Expected: PASS。

### Task 5: 後台表格顯示 LINE 暱稱

**Files:**
- Modify: AppDeploy `matrix-sanqwn/src/AdminApp.tsx`
- Create: AppDeploy `matrix-sanqwn/src/line-display-name.test.ts`
- Modify: AppDeploy `matrix-sanqwn/src/admin.css` only if long nicknames need existing table overflow correction

**Interfaces:**
- Consumes: `lineDisplayName`
- Produces: table header `LINE 暱稱`；空值 `未提供`

- [ ] **Step 1: 新增 RED 測試**

以 source/behavior test 斷言 users 與 subscriptions fields 使用 `lineDisplayName`、中文標籤為 `LINE 暱稱`、不再使用 `lineUserId`；display helper 對空值回傳 `未提供`。

- [ ] **Step 2: 執行 RED**

Run: `npm test -- src/line-display-name.test.ts`  
Expected: FAIL。

- [ ] **Step 3: 修改欄位與顯示**

將兩個表格欄位替換為 `lineDisplayName`，更新 `zh`，並在暱稱欄空值時顯示 `未提供`。確認對話框使用 row 的暱稱顯示，但保存操作仍傳 member UUID。

- [ ] **Step 4: 執行 GREEN**

Run: `npm test -- src/line-display-name.test.ts src/admin-confirmation.test.ts`  
Expected: PASS。

### Task 6: 完整系統設定控制台 UI

**Files:**
- Modify: AppDeploy `matrix-sanqwn/src/system-status.test.ts`
- Modify: AppDeploy `matrix-sanqwn/src/system-status.ts`
- Modify: AppDeploy `matrix-sanqwn/src/AdminApp.tsx`
- Modify: AppDeploy `matrix-sanqwn/src/system-status.css`

**Interfaces:**
- Consumes Task 3 status DTO 與 Task 4 sync result。
- Produces: 整體狀態、服務位置、資料同步、排程四區，以及 copy/retry/sync actions。

- [ ] **Step 1: 新增 RED 測試**

斷言 DTO 正規化、部分失敗仍保留成功項、copy URL 使用原始公開 URL、同步按鈕權限、loading 防重複、同步結果文案及個別 action label。

- [ ] **Step 2: 執行 RED**

Run: `npm test -- src/system-status.test.ts`  
Expected: FAIL，因目前 helper 只處理扁平 items。

- [ ] **Step 3: 實作 helper 與 UI**

用既有 app-owned confirmation dialog 包住「同步 LINE 暱稱」；網址使用唯讀文字與複製按鈕；每區有固定載入／錯誤幾何。一般角色隱藏同步按鈕但保留統計與安全檢查。

- [ ] **Step 4: 實作響應式樣式**

沿用現有 tokens，桌面自適應多欄、手機單欄；長 URL 可換行，狀態文字與圖示並用，按鈕具有 hover/focus/disabled/busy。

- [ ] **Step 5: 執行 GREEN 與 UI 回歸**

Run: `npm test -- src/system-status.test.ts src/admin-button-styles.test.ts src/admin-confirmation.test.ts`  
Expected: PASS。

### Task 7: 全面驗證與正式部署

**Files:**
- Verify all changed AppDeploy files
- Verify GitHub migration and spec/plan

**Interfaces:** 所有前述 tasks 的整合成果。

- [ ] **Step 1: 執行完整測試與 build**

Run: `npm test`  
Run: `npm run build`  
Expected: 全部 PASS，無 TypeScript/build error。

- [ ] **Step 2: 部署 AppDeploy 正式後台**

使用既有 `matrix-sanqwn` app，以 partial file updates 部署；持續輪詢至 `ready`，QA/e2e 無錯誤。

- [ ] **Step 3: 驗證 Supabase 實際資料**

確認 LINE identity 有暱稱者全部同步，`missing = 0`；確認 trigger enabled、private schema 與 function 權限安全。

- [ ] **Step 4: 驗證正式後台與 API**

確認 `matrix-sanqwn` 與 `app-snsxet` ready、無 frontend/backend errors；手機與桌面 QA 畫面沒有版面溢出。

- [ ] **Step 5: 驗證 GitHub/Vercel**

確認 migration/plan 已在 main，最新 commit status checks 成功。報告實際測試、部署 URL、資料筆數與任何既有且未在本次範圍處理的 advisor 項目。
