# 管理者代辦與 Matrix 狀態 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不改動其他產品流程的前提下，加入管理者共用代辦 CRUD，並讓 Matrix 狀態的觸發計數、來源權限、觸發卡與版路驗證符合核准規格。

**Architecture:** 管理後臺使用獨立 `admin_todos` service、四條 session-protected API 與獨立 React 元件；Supabase public table 僅開放 service role。Matrix 規則引擎讓每個 trigger 攜帶自己的 witness roads，service 再依 2／7／13 權限做伺服器端投影；PWA 只渲染已裁切 response，展開可見版路時才呼叫既有驗證 RPC。

**Tech Stack:** React 19、TypeScript、Vitest、AppDeploy SDK、Supabase/Postgres、Python/pytest、Supabase Edge Functions。

**Spec:** `docs/superpowers/specs/2026-09-04-admin-todos-matrix-status-design.md`

## Global Constraints

- 「成立次數」與「連準次數」是同一欄位，介面只顯示「連準次數」。
- Matrix 固定使用最新一期、十三期來源、由小到大、完整驗證、加減／合值／拖牌與準4+／準5+。
- 每一觸發一張卡；卡內相同實際版路只顯示、只計一次；跨觸發可分別計入。
- 未授權內容不可進入前端 response；預測號碼永遠可見，其他受限欄位顯示「🔒 Matrix Pro」。
- 管理者代辦所有角色可建立；本人可編輯／刪除；超級管理員可刪除任何留言。
- 只修改本需求直接相關檔案；不搬移天天樂爬蟲、不重構其他頁面或演算法。
- 響應式基準為 360、375、390px，不新增共享頁殼固定寬高或水平裁切。

---

### Task 1: 建立安全的 admin_todos schema 與資料服務

**Files:**
- Create: `supabase/migrations/20260904070000_admin_todos.sql`
- Create: `apps/admin/backend/admin-todos.ts`
- Create: `apps/admin/backend/admin-todos.test.ts`
- Create: `apps/admin/backend/admin-todos-migration.test.ts`

**Interfaces:**
- Consumes: `SupabaseTransport` 的 `selectRows`、`insertRows`、`updateRows`、`deleteRows`。
- Produces: `createAdminTodos(transport)`，提供 `list()`、`create(content, actor)`、`update(id, content, actor)`、`remove(id, actor)`。

- [ ] **Step 1: 先寫 migration contract 失敗測試**

```ts
expect(sql).toMatch(/create table public\.admin_todos/i);
expect(sql).toMatch(/char_length\(btrim\(content\)\) between 1 and 100/i);
expect(sql).toMatch(/enable row level security/i);
expect(sql).toMatch(/revoke all .* anon, authenticated/i);
expect(sql).toMatch(/grant select, insert, update, delete .* service_role/i);
```

- [ ] **Step 2: 執行測試並確認因 migration 尚不存在而失敗**

Run: `cd apps/admin && npm test -- backend/admin-todos-migration.test.ts`

Expected: FAIL，指出找不到 `20260904070000_admin_todos.sql`。

- [ ] **Step 3: 建立最小 migration**

```sql
create table public.admin_todos (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references public.admin_accounts(id),
  content varchar(100) not null,
  created_at timestamptz not null default now(),
  constraint admin_todos_content_length check (char_length(btrim(content)) between 1 and 100)
);
create index admin_todos_created_at_idx on public.admin_todos (created_at desc, id desc);
alter table public.admin_todos enable row level security;
revoke all on table public.admin_todos from public, anon, authenticated;
grant select, insert, update, delete on table public.admin_todos to service_role;
```

- [ ] **Step 4: 先寫資料服務權限與驗證失敗測試**

測試必須證明：清單依建立時間倒序並 join 作者；建立忽略 client admin id；trim 後空白及 101 字被拒絕；本人可更新／刪除；他人更新為 403；他人刪除為 403；超級管理員可刪除他人；不存在為 404。

- [ ] **Step 5: 執行資料服務測試並確認缺少 createAdminTodos 而失敗**

Run: `cd apps/admin && npm test -- backend/admin-todos.test.ts`

Expected: FAIL，module 或 export 尚不存在。

- [ ] **Step 6: 實作最小資料服務**

```ts
export type TodoActor = { id: string; role: string };
export function normalizeTodoContent(value: unknown) {
  const content = String(value ?? '').trim();
  if (!content || [...content].length > 100) throw new AdminTodoError('代辦事項限 1～100 字', 400);
  return content;
}
```

`update` 先 select owner，再以 `id=eq.<id>&admin_id=eq.<actor.id>` 更新；`remove` 只有超級管理員可省略 owner filter。所有 mutation 只回傳安全 todo 欄位與作者顯示名稱。

- [ ] **Step 7: 執行兩組測試確認通過**

Run: `cd apps/admin && npm test -- backend/admin-todos.test.ts backend/admin-todos-migration.test.ts`

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/20260904070000_admin_todos.sql apps/admin/backend/admin-todos.ts apps/admin/backend/admin-todos.test.ts apps/admin/backend/admin-todos-migration.test.ts
git commit -m "feat(admin): add secure todo storage"
```

### Task 2: 串接管理後臺 todo API

**Files:**
- Modify: `apps/admin/backend/index.ts`
- Modify: `apps/admin/backend/index-wiring.test.ts`

**Interfaces:**
- Consumes: Task 1 `createAdminTodos`、既有 `sessionGuard` 與 `actorOf`。
- Produces: `GET/POST /api/todos`、`PUT/DELETE /api/todos/:id`。

- [ ] **Step 1: 先新增 route wiring 失敗測試**

```ts
expect(routes['GET /api/todos']).toHaveLength(2);
expect(routes['POST /api/todos']).toHaveLength(2);
expect(routes['PUT /api/todos/:id']).toHaveLength(2);
expect(routes['DELETE /api/todos/:id']).toHaveLength(2);
```

逐一執行 session middleware 與 handler，確認 actor 一律取 credential session，body 中偽造的 `adminId`、`role` 不會傳入 service。

- [ ] **Step 2: 執行測試並確認 routes 尚不存在**

Run: `cd apps/admin && npm test -- backend/index-wiring.test.ts`

- [ ] **Step 3: 建立 service singleton 並新增四條只有 sessionGuard 的 routes**

```ts
'POST /api/todos': [sessionGuard, async (ctx) => {
  try { return json({ item: await adminTodos.create(bodyOf(ctx).content, actorOf(await getAdmin(ctx))) }, 201); }
  catch (cause) { return fail(cause); }
}],
```

其他三條使用相同錯誤邊界；不得加 generic `can_add/can_edit/can_delete`，因本模組權限由核准規格獨立定義。

- [ ] **Step 4: 執行 route 與既有 admin tests**

Run: `cd apps/admin && npm test -- backend/index-wiring.test.ts backend/admin-auth.test.ts backend/admin-data.test.ts backend/admin-writes.test.ts`

- [ ] **Step 5: Commit**

```bash
git add apps/admin/backend/index.ts apps/admin/backend/index-wiring.test.ts
git commit -m "feat(admin): expose session-owned todo API"
```

### Task 3: 新增緊湊的管理者代辦頁

**Files:**
- Create: `apps/admin/src/admin-todos.ts`
- Create: `apps/admin/src/admin-todos.test.ts`
- Create: `apps/admin/src/AdminTodos.tsx`
- Create: `apps/admin/src/admin-todos.css`
- Create: `apps/admin/src/admin-todos-ui.test.ts`
- Modify: `apps/admin/src/AdminApp.tsx`
- Modify: `apps/admin/src/admin-density.test.ts`

**Interfaces:**
- Consumes: AppDeploy `api` client、Task 2 routes、AdminApp 現有 `requestConfirmation`。
- Produces: `AdminTodos` 元件與「代辦事項」主選單入口。

- [ ] **Step 1: 先寫 client normalization 與 UI contract 失敗測試**

測試 `normalizeAdminTodo` 將 snake_case 映射成 `id/adminId/authorName/content/createdAt`；UI source contract 必須含 `noValidate`、textarea `maxLength={100}`、可見「0/100」、`aria-invalid`、`aria-describedby`、`resize: none`、建立／編輯 busy 防重、本人動作判斷、超級管理員刪除判斷與確認刪除文字。

- [ ] **Step 2: 執行測試確認新模組不存在**

Run: `cd apps/admin && npm test -- src/admin-todos.test.ts src/admin-todos-ui.test.ts`

- [ ] **Step 3: 實作 API client 與獨立 AdminTodos 元件**

元件狀態固定為：initial loading、ready、empty、load error、create/edit mutation、delete confirmation。編輯只保留一張卡的 draft；API 失敗保留 draft。作者本人顯示編輯／刪除，超級管理員對他人只顯示刪除。

- [ ] **Step 4: 加入 scoped CSS**

使用 `.adminTodos*` 前綴；textarea 與卡片 `width: 100%; min-width: 0`；使用 grid/flex wrap、既有色彩與圓角；不設定整頁固定高度。360px 下 action 不超出卡片，focus-visible 與 disabled/busy 可辨識，reduced-motion 關閉位移。

- [ ] **Step 5: 在 AdminApp 最小接線**

新增 `ListTodo` 圖示與 `['代辦事項', ListTodo]`，`load('代辦事項')` 只清空 generic rows；content 區渲染 `<AdminTodos admin={admin} requestConfirmation={requestConfirmation} />`。切換模組不改其他 module state machine。

- [ ] **Step 6: 執行 admin unit、build 與 360／375／390px browser checks**

Run: `cd apps/admin && npm test`

Run: `cd apps/admin && npm run build`

Expected: 0 failures；窄螢幕無水平 overflow，建立、空白拒絕、編輯取消／失敗保留、刪除確認與權限動作均正確。

- [ ] **Step 7: Commit**

```bash
git add apps/admin/src/admin-todos.ts apps/admin/src/admin-todos.test.ts apps/admin/src/AdminTodos.tsx apps/admin/src/admin-todos.css apps/admin/src/admin-todos-ui.test.ts apps/admin/src/AdminApp.tsx apps/admin/src/admin-density.test.ts
git commit -m "feat(admin): add compact shared todo board"
```

### Task 4: 讓每個 Matrix trigger 持有自己的唯一 witness roads

**Files:**
- Modify: `backend/matrix-status.ts`
- Modify: `backend/matrix-status.test.ts`

**Interfaces:**
- Consumes: `StatusRoad[]`。
- Produces: `StatusTriggerCard` 增加 `ruleId`；`sameCodeRoadCount` 與 `roads` 均由該 trigger 的唯一 witness set 產生。

- [ ] **Step 1: 先修正／新增規則引擎失敗測試**

涵蓋啟動1～2、聚合1～6、共振1～10、臨界1～4 的上下界與不成立案例。額外斷言：

```ts
expect(card.ruleId).toBe('ACTIVE-1');
expect(card.sameCodeRoadCount).toBe(card.roads.length);
expect(card.roads.every((road) => ['加減', '合值'].includes(road.algorithmType) && [5, 6].includes(road.streak))).toBe(true);
```

重複相同唯一鍵的輸入只計一次；同一 road 可出現在兩張不同 ruleId 卡；加減＋拖牌與合值＋拖牌缺任一側不成立；two-code 結果順序正規化後仍是一組，不由 two one-code 合成。

- [ ] **Step 2: 執行測試並確認舊 `group.roads.length`／全量 roads 造成預期失敗**

Run: `npm run test:unit -- backend/matrix-status.test.ts`

- [ ] **Step 3: 將 Trigger 改為攜帶 ruleId 與 witnesses**

```ts
type Trigger = {
  ruleId: MatrixStatusRuleId;
  key: string;
  status: Exclude<MatrixStatus, 'DORMANT'>;
  roads: StatusRoad[];
};
```

以 `matchingRoads(types, min, max)` 與 `mixedRoads(primary, min, max)` 回傳 witness；AND 規則合併各指定區段的 witness；建立卡片前以穩定 road key 去重並排序。禁止再以整個 result group 建卡。

- [ ] **Step 4: 執行 Matrix 規則與自訂狀態回歸**

Run: `npm run test:unit -- backend/matrix-status.test.ts backend/matrix-status-service.test.ts backend/matrix-custom-status.test.ts`

- [ ] **Step 5: Commit**

```bash
git add backend/matrix-status.ts backend/matrix-status.test.ts
git commit -m "fix(matrix): count trigger-specific status roads"
```

### Task 5: 保存十三期分析中的二／七／十三期最小來源層級

**Files:**
- Modify: `services/matrix-api/app/services/artifact_builders.py`
- Modify: `services/matrix-api/tests/test_status_artifact_sources.py`
- Modify: `services/matrix-api/tests/test_artifact_builders.py`

**Interfaces:**
- Produces: `status_source_tier(locked_source_index) -> Literal[2, 7, 13]`，規則為 index 0–1 → 2、2–6 → 7、7–12 → 13。

- [ ] **Step 1: 先寫來源層級失敗測試**

```py
assert [item['explorePeriods'] for item in sources] == [2, 2, 7, 7, 13, 13]
assert [road['explorePeriods'] for road in artifact['cards'][0]['roads']] == [2, 7, 13]
```

同時保留 source index 13 與非本日排除、extra validation 不進 compact source 的斷言。

- [ ] **Step 2: 執行 pytest 並確認目前固定 13 造成失敗**

Run: `cd services/matrix-api && pytest tests/test_status_artifact_sources.py tests/test_artifact_builders.py -q`

- [ ] **Step 3: 實作唯一層級 helper 並移除 derive_full_range 覆寫**

`_EXPLORE_STATUS_FIELDS` 保留 `lockedSourceIndex`，compact copy 後由同一 helper 寫入 `explorePeriods`；`_status_artifact` 建立每條 road 時也使用同一 helper。完整十三期 eligibility 條件維持 `< 13`，不可改成只分析某一 tier。

- [ ] **Step 4: 執行 artifact 與 Matrix acceptance 回歸**

Run: `cd services/matrix-api && pytest tests/test_status_artifact_sources.py tests/test_artifact_builders.py tests/test_matrix_algorithm_acceptance_v1.py -q`

- [ ] **Step 5: Commit**

```bash
git add services/matrix-api/app/services/artifact_builders.py services/matrix-api/tests/test_status_artifact_sources.py services/matrix-api/tests/test_artifact_builders.py
git commit -m "fix(matrix): preserve status source access tiers"
```

### Task 6: 由伺服器投影可見與鎖定 Matrix 版路

**Files:**
- Modify: `backend/matrix-status.ts`
- Modify: `backend/matrix-status-service.ts`
- Modify: `backend/matrix-status-service.test.ts`
- Modify: `backend/matrix-status-routes.test.ts`

**Interfaces:**
- Produces: `StatusRoadProjection` union；可見項目含完整欄位與 `locked:false`、`validationItemId`，鎖定項目只含 opaque `id`、`result`、`explorePeriods`、`locked:true`。
- Produces: card 的 `sameCodeRoadCount: number | null` 與 `sameCodeRoadCountLocked: boolean`。

- [ ] **Step 1: 先寫三層 entitlement 失敗測試**

免費：二期完整、七／十三期只保留 result 且沒有 `lockedNumber/position/streak/algorithmType/validationItemId`。七期開放：二／七完整、十三鎖定。Pro：全部完整。若卡片仍有鎖定 road，總同碼數量回傳 null 並標記 locked；全部可見才回傳精確數量。

- [ ] **Step 2: 執行 service／route tests 並確認舊邏輯直接刪除七／十三期而失敗**

Run: `npm run test:unit -- backend/matrix-status-service.test.ts backend/matrix-status-routes.test.ts`

- [ ] **Step 3: 實作 projection，禁止從 explore 全結果重新灌入 trigger**

`visibleStatusCards` 只遍歷 `card.roads`，不得以相同 result 從 `exploreRoads` 補入不屬於該 trigger 的版路。entitlement 只決定每條 road 完整或鎖定，不改 trigger 是否存在。full road 的 `validationItemId` 由 `chapterRoads` 的原始 item id 取得。

- [ ] **Step 4: 執行狀態、entitlement 與 route 全組回歸**

Run: `npm run test:unit -- backend/matrix-status.test.ts backend/matrix-status-service.test.ts backend/matrix-status-routes.test.ts backend/matrix-entitlements.test.ts`

- [ ] **Step 5: Commit**

```bash
git add backend/matrix-status.ts backend/matrix-status-service.ts backend/matrix-status-service.test.ts backend/matrix-status-routes.test.ts
git commit -m "fix(matrix): project locked status details server-side"
```

### Task 7: 重做 Matrix 狀態觸發卡與可展開版路列

**Files:**
- Modify: `src/matrix-status-api.ts`
- Modify: `src/matrix-status-api.test.ts`
- Modify: `src/FeaturePages.tsx`
- Modify: `src/feature-pages.css`
- Modify: `src/__tests__/MatrixStatusPage.test.tsx`
- Modify: `UX-CONTRACT.md`

**Interfaces:**
- Consumes: Task 6 projection 與既有 `fetchExploreValidation`、`ExploreValidationProcess`。
- Produces: 四狀態 category disclosure、每觸發一卡、每版路一個 lazy validation disclosure。

- [ ] **Step 1: 先寫 API type 與 UI 失敗測試**

測試四狀態 header 同列包含 `•臨界`、描述與最右 count；一個 API card 只產生一張 `.status-trigger-card`；一碼／兩碼結果完整；locked row 預測可見且其他五欄均為「🔒 Matrix Pro」；同碼數 locked 時顯示相同文案；unlocked row button 有 `aria-expanded`，第一次展開只呼叫一次 `fetchExploreValidation`，收合再開使用 cache；locked row 不呼叫 validation。

- [ ] **Step 2: 執行測試並確認舊平面列表與 detailLocked banner 造成失敗**

Run: `npm run test:unit -- src/matrix-status-api.test.ts src/__tests__/MatrixStatusPage.test.tsx`

- [ ] **Step 3: 更新 response union 與 status page state**

用 `expandedRoadKey`、`validationById`、`validationLoadingId` 管理 disclosure。cache key 為 `${analysisVersion}:${validationItemId}`；access 傳 road 的 `explorePeriods` 與固定 `完整範圍`。API 失敗在該列顯示可重試錯誤，不把整頁清空。

- [ ] **Step 4: 以探索結果 canonical 結構渲染**

每張 trigger card header 顯示結果、狀態、同碼版路數量；內部採 `.road-results-head` 六欄與 button row 語意。欄名固定為位置、號碼、預測期、連準次數、預測、版路類型。不得顯示 A/B/C/D 或「成立次數」。

- [ ] **Step 5: 清理僅限 Matrix 狀態的舊 CSS 衝突**

移除 70px header、三欄 `50px 17px` 與未使用的舊 `.status-table/.status-road-card` 規則；建立 scoped category／trigger／row 規則。標題為單列 flex，description `margin-inline-start:8px`，count `margin-inline-start:auto`；窄螢幕以 `minmax(0,1fr)`、clamp 字級及探索表格既有欄寬，不能用 `100vw`。

- [ ] **Step 6: 更新 UX contract 的 Matrix disclosure、locked projection 與 CRUD ledger**

只新增本次可觀察行為，不改既有 token ownership、原生 select/date 或 scrollbar 契約。

- [ ] **Step 7: 執行前端相關回歸與 build**

Run: `npm run test:unit -- src/__tests__/MatrixStatusPage.test.tsx src/__tests__/MatrixExplorePage.test.tsx src/matrix-status-api.test.ts tests/premium-contract.test.mjs`

Run: `npm run build:pages`

- [ ] **Step 8: Commit**

```bash
git add src/matrix-status-api.ts src/matrix-status-api.test.ts src/FeaturePages.tsx src/feature-pages.css src/__tests__/MatrixStatusPage.test.tsx UX-CONTRACT.md
git commit -m "feat(matrix): show responsive trigger cards and validation"
```

### Task 8: Supabase 與 Edge Function 驗證

**Files:**
- Modify if required by deployment import graph: `supabase/functions/matrix-status/*`

**Interfaces:**
- Consumes: committed migration與 backend modules。
- Produces: production schema 與新的 `matrix-status` function version。

- [ ] **Step 1: 查閱當日 Supabase changelog、RLS/grant 與 Edge Function 文件**

確認 public schema RLS、service-role server-only 與 function deployment 規則未有 breaking change。

- [ ] **Step 2: 套用命名 migration**

以 `supabase_apply_migration` 執行 `20260904070000_admin_todos` 的完整 SQL，不用多次 DDL 試寫 production。

- [ ] **Step 3: 執行 schema 查詢**

```sql
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'admin_todos'
order by ordinal_position;
```

再查 `pg_class.relrowsecurity`、table privileges、constraint 與 index，確認 anon/authenticated 無權限、service_role 有 CRUD。

- [ ] **Step 4: 部署 matrix-status Edge Function**

保持既有 `verify_jwt` 設定與所有相對 import；部署後用已登入 request 驗證 free／seven-open／Pro response，不輸出 token 或 service key。

- [ ] **Step 5: 執行 Supabase security 與 performance advisors**

只修復本 migration 引入的 finding；既有非相關 finding 記錄但不擴大修改。

### Task 9: 全面驗證、PR 與管理後臺部署

**Files:**
- All files changed by Tasks 1–8

- [ ] **Step 1: 執行完整 repository commands**

Run: `npm run test:unit`

Run: `node --test tests/*.test.mjs`

Run: `npm run build:pages`

Run: `cd apps/admin && npm test && npm run build`

Run: `cd services/matrix-api && pytest -q`

- [ ] **Step 2: 執行 Premium UI 驗證**

Run: `python <frontend-design-premium>/scripts/audit_project.py . --mode strict`

Run: `npx -p @google/design.md designmd lint DESIGN.md`

搜尋本次 changed code 的 native dialog、非語意 click target、missing states、screen-local duplicate 與不必要 fixed/overflow 覆寫；每個 match 都必須排除或修正。

- [ ] **Step 3: 真實瀏覽器驗證**

PWA：360／375／390px 四狀態 header、全部 trigger cards、locked projection、keyboard focus、row expand、validation success/failure/loading、reduced motion。管理後臺：所有角色建立、owner edit/delete、super delete-other、non-owner forbidden、empty/100/101、load/mutation failures、delete dialog、窄螢幕 overflow。

- [ ] **Step 4: 建立 PR 1**

Base: `main`  
Head: `codex/admin-todos-matrix-status-20260904`

PR body 列出資料庫 migration、權限矩陣、22 規則／witness 計數、2/7/13 投影、UI 互動、測試證據與部署步驟。

- [ ] **Step 5: 等 CI 全部通過並處理 review finding**

不得用 partial test 推論全綠；若 CI 失敗，先新增／確認回歸測試再修正。

- [ ] **Step 6: 部署既有 AppDeploy 管理後臺**

先讀取 AppDeploy deployment instructions；以現有 app id 更新 changed files，持續輪詢至 `ready` 且 E2E/QA 無錯誤。不得建立第二個管理後臺。

- [ ] **Step 7: 依使用者已核准的執行範圍完成 PR 1 合併後，再開始 PR 2**

合併前重新確認 `main` 未出現衝突修改；合併後以新 main 作為通知整合基準。
