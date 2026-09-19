# Matrix 四職責 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans for inline execution, or superpowers:subagent-driven-development if the user selects delegation. Steps use checkbox syntax for tracking.

**Goal:** 在既有 Watchdog 架構建立可驗證的監控、診斷、安全恢復及優化候選流程。

**Architecture:** Watchdog 及 Inspector 共用同一期數的證據；Recovery 沿用既有服務及 lease，執行後重新讀取並驗證；Optimizer 只讀統計與程式碼，輸出候選。結果使用既有狀態儲存及管理後台，不建立第二套監控表。

**Tech Stack:** 現有 TypeScript／React、Python、Supabase PostgreSQL／Edge Functions、Railway、GitHub Actions；不新增框架。

**Spec:** `matrix-watchdog-four-roles-spec.md`，加上本對話已確認的六步實作方向。資料模型採 A：在既有 system_job_status 補三個欄位。Optimizer 排程頻率、長期保留仍未指定，本計畫不設定自動啟用值。

## Global Constraints

- 正式基準：`spyuilin688-sudo/lottery-matrix/main`，本輪重查仍為 `25037dc4ba4a190888a4077fe558aa886eccc490`。
- 已建立獨立分支 `feat/watchdog-four-roles`；本地檔案 tree SHA 與 main 的 `9e9e2e88671253a1fa601de6e02622b8364cd7ec` 完全一致。
- 不直接修改 main／production；合併與正式部署另行執行。
- 只執行明確指定檔案的相關測試；禁止全量測試。
- 不新增 `monitor_status`、`auto_fix_status`、`repair_logs`。
- 不新增 `!important`、inline style 或第二套 CSS 覆寫。
- 不更改開獎日判斷、現有恢復間隔或演算法條件。
- 不自動 DROP INDEX，不自動改既有 RPC／Edge Function 權限。
- `accepted`、`lease-held`、`already-running` 均不等於恢復成功。

## Review Focus

1. 恢復中最新期改變：舊期成功不能更新新期健康結果；Task 2、3 驗證。
2. HTTP 回應遺失但實際已執行：重送不能重複計數或併發執行；Task 2 驗證。
3. Custom Status 設定變更：舊 config_key 不能當成目前結果；Task 1、3 驗證。
4. Railway／Supabase 證據部分不可讀：不得把缺證據判為成功或已知根因；Task 1、4 驗證。
5. 無新期正常跳過、版本升級重算、無理由重算三者不同；Task 5 驗證。

## 執行順序與交付

| 順序 | 交付 | 依賴 |
| --- | --- | --- |
| 1 | 共用資料鏈證據與 Watchdog 正確健康狀態 | 既有 snapshot／日曆／analysis RPC |
| 2 | 原子計數與恢復完成驗證 | Task 1 |
| 3 | 指定期與指定階段恢復 | Task 1、2 |
| 4 | Inspector 與 Railway 讀取整合 | Task 1 |
| 5 | Optimizer 單次檢查及 main 程式碼檢查 | Task 1、2、4 |
| 6 | 後台呈現與 CI／Smoke／Verify | Task 1–5 |

不將 Task 1–3 的完成誤報為全部四職責完成。

---

### Task 1: 共用證據、Watchdog 與 Status 完整性

**Files:**
- Create: `apps/admin/backend/matrix-chain.ts`
- Create: `apps/admin/backend/matrix-chain.test.ts`
- Modify: `apps/admin/backend/watchdog.ts`
- Modify: `apps/admin/backend/watchdog-status.ts`
- Modify: `apps/admin/backend/watchdog.test.ts`
- Modify: `apps/admin/backend/watchdog-status.test.ts`
- Modify: `apps/admin/backend/connection-status.ts`
- Modify: `apps/admin/backend/connection-status.test.ts`
- Create migration through Supabase CLI: logical name `matrix_chain_evidence` under `supabase/migrations/`.
- Create: `tests/matrix-chain-migration.test.mjs`

**Interfaces:**

```ts
export type StageState = 'PASS' | 'FAIL' | 'WAITING' | 'UNKNOWN';
export type ChainStage = 'schedule' | 'job' | 'crawler' | 'draw'
  | 'analysis' | 'matrix-status' | 'custom-status';
export type StageEvidence = {
  stage: ChainStage;
  state: StageState;
  source: string;
  observedAt: string;
  period: string | null;
  code: string;
};
export type ChainReport = {
  lottery: '今彩539' | '天天樂' | '六合彩' | '大樂透';
  drawPeriod: string | null;
  checkedAt: string;
  state: StageState;
  stages: StageEvidence[];
};
export function evaluateChain(input: Omit<ChainReport, 'state'>): ChainReport;
```

- Consumes：既有開獎日及到期檢查、job／draw 資料、`matrix_watchdog_analysis_state`。
- Produces：`ChainReport[]`，附加到既有 WatchdogStatus；允許舊 snapshot 暫缺新欄位，但顯示 UNKNOWN，不製造 PASS。
- SQL 產出：`matrix_watchdog_chain_state(p_lottery text, p_draw_period text) returns jsonb`。只回傳各層的期數、版本、缺少數量與時間，不回傳會員名單或結果大 payload。

- [ ] **Step 1: 新增失敗測試。**

```ts
it('does not turn accepted recovery into a healthy data chain', () => {
  const result = evaluateChain({lottery: '天天樂', drawPeriod: '12004',
    checkedAt: '2026-09-20T00:00:00Z', stages: [{stage: 'analysis',
      state: 'WAITING', source: 'matrix_analysis_runs',
      observedAt: '2026-09-20T00:00:00Z', period: '12004', code: 'RECOVERY_ACCEPTED'}]});
  expect(result.state).not.toBe('PASS');
});
```

另測：缺任一必要階段、跨期 PASS、讀取失敗、未配置 Custom Status、config_key 改變、部分讀取成功、過期心跳。

- [ ] **Step 2: 執行紅燈測試。**

Run: `./node_modules/.bin/vitest run apps/admin/backend/matrix-chain.test.ts`

Expected：缺少 evaluateChain 行為而失敗；不能以環境設定錯誤代替。

- [ ] **Step 3: 實作證據與判斷。**

```ts
const required: ChainStage[] = ['schedule','job','crawler','draw',
  'analysis','matrix-status','custom-status'];
// 每個必要階段必須存在且對齊目標期；FAIL 優先，缺證據為 UNKNOWN，
// 執行中為 WAITING；全部證據 PASS 才能回傳 PASS。
```

分析完整性沿用啟用版本 RPC，不重做演算法判斷。Custom Status 依目前有設定的會員集合、期數、analysis_version、config_key 檢查；沒有設定時記錄「無需重算」證據。需沿用 `matrixCustomStatusConfigKey` 的既有定義，不另創等價雜湊。

擴充 snapshot loader、sanitizer、heartbeat 消費端一起提交；持久化前限制字串長度、四彩數量及階段集合。

- [ ] **Step 4: SQL 行為驗證及相關測試。**

Run: `node --test tests/matrix-chain-migration.test.mjs`

Run: `./node_modules/.bin/vitest run apps/admin/backend/matrix-chain.test.ts apps/admin/backend/watchdog.test.ts apps/admin/backend/watchdog-status.test.ts apps/admin/backend/watchdog-active-analysis.test.ts apps/admin/backend/watchdog-calendar.test.ts apps/admin/backend/connection-status.test.ts`

Expected：全部指定測試通過。SQL 測試使用隔離資料庫執行函式與 fixture，驗證結果及 service_role 權限，不只比對 SQL 字串。

- [ ] **Step 5: 提交此一完整變更。**

Commit: `feat: verify per-lottery watchdog data chains`

### Task 2: 沿用 lease，加入原子計數與恢復完成驗證

**Files:**
- New migration logical name: `matrix_verified_recovery_counters`。
- Create: `tests/matrix-recovery-counters.test.mjs`
- Modify: `services/matrix-api/app/recovery.py`
- Modify: `services/matrix-api/app/watchdog_lease.py`
- Modify: `services/matrix-api/tests/test_recovery_coordinator.py`
- Modify: `services/matrix-api/tests/test_watchdog_lease.py`

**Interfaces:**
- Consumes：Task 1 chain RPC、既有 lease_key／owner_id／runner_id。
- Produces：重試計數、驗證後成功計數，以及不將例外吞成成功的 RecoveryCoordinator。

```sql
alter table public.system_job_status
  add column retry_count bigint not null default 0 check (retry_count >= 0),
  add column recovery_count bigint not null default 0 check (recovery_count >= 0),
  add column last_recovery_at timestamptz;
```

以 migration 實際增量方式處理欄位；既有 fail／success 更新不得重設新增累計值。retry_count 此階段明確記錄恢復重試實際開始的次數，不將被 lease 擋下的請求或只接受 HTTP 的請求計入。

採用既有表中的 recovery job 列，避免把分析恢復執行結果覆寫到 crawler job.status。job_name 明確包含 recovery 與彩種；既有四個 crawler job_name 保留。

- [ ] **Step 1: SQL 與 Python 先寫失敗測試。**

```python
def test_accepted_request_does_not_count_as_verified_recovery():
    events = []
    released = Event()
    coordinator = RecoveryCoordinator(
        runner=lambda _: None,
        begin_lease=lambda *_: True,
        verify=lambda _: False,
        record_success=lambda *_: events.append('success'),
        release_lease=lambda *_: released.set(),
    )
    coordinator.enqueue('天天樂', 'lease-owner')
    assert released.wait(1)
    assert events == []
```

擴充 RecoveryCoordinator 的 keyword-only 參數：`verify: Callable[[str], bool] | None` 與 `record_success: Callable[[str, str, str], object] | None`；正式配置兩者必須同時存在，未配置不計成功。測試沿用既有 `threading.Event`。Task 3 再將目標期數加入 runner 與 verifier 使用的請求上下文。

另測：同 lease 重送 begin／finish、lease 過期、runner 不符、驗證失敗、驗證 RPC 無法讀取、成功計數更新交易回滾。

- [ ] **Step 2: Run 紅燈。**

Run: `node --test tests/matrix-recovery-counters.test.mjs`

Run from services/matrix-api: `uv run pytest tests/test_recovery_coordinator.py tests/test_watchdog_lease.py -q`

Expected：新行為測試失敗，現有 lease 案例保持可重現。

- [ ] **Step 3: 實作原子 begin／verify／finish。**

```python
# 在仍持有有效 recovery lease 時驗證。
# DB 完成函式同一交易確認 ownership、資料結果、更新成功計數，
# 再結束該次 lease；重送不會再次命中同一有效 lease。
if verification_complete:
    finish_verified_recovery(lottery, owner, runner_id, target_period)
```

`finish_verified_recovery` 對應新增的 service_role-only RPC；由資料庫再次確認 chain，不能接受呼叫端傳 true 即算成功。失敗路徑記錄失敗結果並沿用既有 lease 清理規則。

- [ ] **Step 4: 執行同一批指定測試至綠燈。** Expected：全部通過，無重複累加。
- [ ] **Step 5: Commit。** `feat: record recovery only after verified completion`

### Task 3: 指定期／指定階段恢復，補齊 Custom Status

**Files:**
- Modify: `apps/admin/backend/watchdog.ts`
- Modify: `apps/admin/backend/worker-api.ts`
- Modify: `apps/admin/backend/index.ts`
- Create: `services/matrix-api/app/recovery_request.py`
- Modify: `services/matrix-api/app/recovery_server.py`
- Modify: `services/matrix-api/app/api_server.py`
- Modify: `services/matrix-api/app/recovery.py`
- Modify: `services/matrix-api/app/services/custom_status_recompute.py`
- Modify: `backend/matrix-custom-status-recompute.ts`
- Modify: `supabase/functions/matrix-status/handler.ts`
- Modify: `supabase/functions/matrix-status/index.ts`
- Create: `services/matrix-api/tests/test_targeted_recovery.py`
- Modify: `services/matrix-api/tests/test_recovery_server.py`
- Modify: `backend/matrix-custom-status-recompute.test.ts`
- Create: `supabase/functions/matrix-status/handler.test.ts`

**Interfaces:**

```ts
type RecoveryRequest = {
  lottery: '今彩539' | '天天樂' | '六合彩' | '大樂透';
  leaseOwner: string;
  drawPeriod: string | null; // 爬蟲尚未取得新期時可以沒有目標期。
  stage: 'crawler' | 'analysis' | 'matrix-status' | 'custom-status';
};
```

- Consumes：Watchdog 的具體失敗層、Task 2 lease／計數。
- Produces：相容舊呼叫的 `/jobs/recover`；新呼叫必須驗證 stage 與 drawPeriod。
- 舊兩參數呼叫沿用原本恢復流程；禁止讓舊入口繞過新完成驗證。

- [ ] **Step 1: 紅燈測試指定期及切期。**

```python
from app.recovery_request import RecoveryRequest, execute_targeted_recovery

def test_status_only_recovery_never_runs_analysis():
    calls = []
    request = RecoveryRequest('天天樂', '12004', 'custom-status')
    result = execute_targeted_recovery(
        request,
        current_period=lambda _: '12004',
        run_stage=lambda value: calls.append(value.stage),
        verify=lambda value: value.draw_period == '12004',
    )
    assert calls == ['custom-status']
    assert result == 'verified'

def test_changed_latest_period_does_not_certify_old_recovery():
    result = execute_targeted_recovery(
        RecoveryRequest('天天樂', '12004', 'custom-status'),
        current_period=lambda _: '12005',
        run_stage=lambda _: None,
        verify=lambda _: True,
    )
    assert result == 'superseded'
```

在 recovery_request.py 定義 frozen dataclass `RecoveryRequest(lottery: str, draw_period: str | None, stage: str)`；`execute_targeted_recovery(request, *, current_period: Callable[[str], str | None], run_stage: Callable[[RecoveryRequest], None], verify: Callable[[RecoveryRequest], bool]) -> str` 回傳 verified／waiting／superseded。取得 lease 與計數由 Coordinator 負責，不能靠此函式回傳值直接增加計數。

另測非法期數、未知 stage、分析 lease 有效、等待來源、API timeout 重送、會員設定在重算中改變。

- [ ] **Step 2: Run。**

Run from services/matrix-api: `uv run pytest tests/test_targeted_recovery.py tests/test_recovery_server.py -q`

Run: `./node_modules/.bin/vitest run backend/matrix-custom-status-recompute.test.ts`

Run: `./node_modules/.bin/vitest run --config vitest.edge-functions.config.ts supabase/functions/matrix-status/handler.test.ts`

Expected：新期數守衛與階段分流案例先失敗。

- [ ] **Step 3: 接通完整呼叫鏈。**

```python
if request.stage == 'custom-status':
    recompute_custom_matrix_status_once(url, key, request.lottery,
                                       expected_period=request.draw_period)
else:
    run_targeted_existing_pipeline(request, repository)
```

`run_targeted_existing_pipeline` 定義在 recovery_request.py，呼叫既有分析／狀態產物建立函式，不複製演算法。舊期請求不能默默改成計算最新期。Custom Status 在寫入前確認期數及版本，並以既有保存流程防止舊結果覆寫較新的結果。

暫時性 API 錯誤使用既有可重試規則；先驗證 operation 可重送，不能對所有錯誤無差別 retry。

- [ ] **Step 4: 重跑上述測試及 worker-api、watchdog 對應測試。** Expected：相容性、指定期、lease、驗證全部通過。
- [ ] **Step 5: Commit。** `feat: recover the failed stage for an explicit draw period`

### Task 4: Inspector 的分層診斷及 Railway 證據

**Files:**
- Create: `apps/admin/backend/matrix-inspector.ts`
- Create: `apps/admin/backend/matrix-inspector.test.ts`
- Create: `apps/admin/backend/railway-evidence.ts`
- Create: `apps/admin/backend/railway-evidence.test.ts`
- Modify: `apps/admin/backend/index.ts`
- Modify: `apps/admin/backend/watchdog-status.ts`

**Interfaces:**

```ts
type Diagnosis = {
  report: ChainReport;
  faultLayer: ChainStage | null;
  rootCause: {code: string; evidence: StageEvidence[]} | null;
};
function inspectChain(report: ChainReport): Diagnosis;
```

- Consumes：Task 1 同期證據與 Railway API 唯讀紀錄。
- Produces：故障層與根因證據；不能確認時 rootCause=null。
- 服務識別採已核對的 project ID／service ID；包含既有 matrix-recovery。

- [ ] **Step 1: 新增紅燈案例。**

```ts
it('does not infer a failed DB write from a missing analysis record', () => {
  const diagnosis = inspectChain({lottery:'天天樂',drawPeriod:'12004',
    checkedAt:'2026-09-20T00:00:00Z',state:'FAIL',stages:[{
      stage:'analysis',state:'FAIL',source:'matrix_analysis_runs',
      observedAt:'2026-09-20T00:00:00Z',period:'12004',code:'ANALYSIS_MISSING'}]});
  expect(diagnosis.faultLayer).toBe('analysis');
  expect(diagnosis.rootCause).toBeNull();
});
```

另測 deployment 成功但 runtime 失敗、相同 service 名稱不同 project、舊版本 log、限流、無權限、缺少 log、任一讀取逾時。

- [ ] **Step 2: Run。** `./node_modules/.bin/vitest run apps/admin/backend/matrix-inspector.test.ts apps/admin/backend/railway-evidence.test.ts`

Expected：新診斷功能案例先失敗。

- [ ] **Step 3: 實作 adapter 與診斷。**

Railway connector 可在本對話查詢，不代表部署後程式已有 Railway 控制平台 API 憑證。先依官方文件核對 runtime API／權限；現有 `MATRIX_ADMIN_STATUS_TOKEN` 是應用 API token，不能拿來當 Railway 管理 token。

以唯讀 adapter 讀取 deploy／Cron／log／metrics；runtime 憑證未配置時回報 UNKNOWN，不能讓資料完整性監控停止，也不能宣稱完整 Inspector 已上線。日誌只保留診斷必要欄位，不轉存 token／request body。

- [ ] **Step 4: 重跑指定測試。** Expected：缺證據不誤判，已知根因有同期直接證據。
- [ ] **Step 5: Commit。** `feat: diagnose watchdog failures using correlated evidence`

### Task 5: Optimizer 的唯讀檢查與候選

**Files:**
- Create: `scripts/matrix-optimizer.mjs`
- Create: `tests/matrix-optimizer.test.mjs`
- Create: `apps/admin/backend/matrix-optimizer.ts`
- Create: `apps/admin/backend/matrix-optimizer.test.ts`
- Create: `.github/workflows/matrix-optimizer.yml`
- Create: `tests/matrix-optimizer-workflow.test.mjs`

**Interfaces:**

```ts
type OptimizationCandidate = {
  category: 'railway' | 'database' | 'security' | 'code';
  subject: string;
  observation: string;
  evidence: string[];
  state: 'candidate' | 'insufficient-evidence';
};
```

- Consumes：Worker 結構化紀錄、Task 2 計數、Task 4 Railway metrics、可取得的 DB／Advisor 資料、指定 main SHA 的程式碼。
- Produces：有證據的候選及未覆蓋項目清單；不產出直接執行 DDL／權限修改的指令。
- scripts/matrix-optimizer.mjs 匯出 `summarizeRuns(runs)`，回傳 `{redundantFullRuns: number, skippedRuns: number, failedRuns: number}`；缺少階段證據者另外列入 coverage，不猜測完整重算。

- [ ] **Step 1: 紅燈分類測試。**

```js
it('does not count already-analyzed as a redundant full calculation', () => {
  const summary = summarizeRuns([{lottery:'天天樂',period:'12004',
    outcome:'already-analyzed',durationMs:20000,executionVersion:'same'}]);
  assert.equal(summary.redundantFullRuns, 0);
});
```

另測相同期數但不同執行版本、stats reset、短觀察期 index 未使用、SQL 正規化後重複、函式同名不同內容、動態 selector、JWT 關閉但 handler 有驗證。無法自動證明的項目必須列 insufficient-evidence。

- [ ] **Step 2: Run。**

Run: `node --test tests/matrix-optimizer.test.mjs tests/matrix-optimizer-workflow.test.mjs`

Run: `./node_modules/.bin/vitest run apps/admin/backend/matrix-optimizer.test.ts`

Expected：新分類與唯讀邊界測試先失敗。

- [ ] **Step 3: 實作 collector、summary 與 code candidate。**

```js
// CLI 執行單次讀取；輸入輸出不接受任意 SQL 寫入。
// --base/--head 固定比較範圍；輸出 evidence 與 coverage。
// 工作流程只使用 contents: read，main push 與手動觸發。
```

程式碼重複使用語法結構與呼叫關係作候選，不能只比函式名稱。死碼／endpoint／selector 未使用由靜態分析提出候選，再標示是否仍需 runtime 證據。慢 SQL／大量掃描／RPC／Edge 執行狀況需各自 collector；未取得資料不寫成「無問題」。

長期比較必須有可重複讀取的歷次觀察資料。實作可接收歷次樣本，但在使用者指定頻率與保留方式前，不新增排程、不偷偷建立另一張統計表，也不宣稱長期監測已啟用。

- [ ] **Step 4: Run 相同指定測試。** Expected：全部通過、無任何寫資料庫或權限變更的路徑。
- [ ] **Step 5: Commit。** `feat: collect evidence-based optimization candidates`

### Task 6: 後台、完整相關驗收及交付

**Files:**
- Create: `apps/admin/src/MatrixWatchdogPanel.tsx`
- Create: `apps/admin/src/MatrixWatchdogPanel.test.tsx`
- Modify: `apps/admin/src/AdminApp.tsx`
- Modify: `apps/admin/src/system-status.ts`
- Modify: `apps/admin/src/system-status.css`；依 DESIGN.md／UX-CONTRACT.md，優先重用 statusRows／statusFacts／statusDetails。
- Modify: `scripts/select-scoped-tests.mjs`（只有靜態依賴無法選中新增測試時才修改）。
- Modify: `.github/workflows/ci.yml`（只有必要的驗收整合）。
- Create: `tests/matrix-watchdog-panel.spec.ts`

**Interfaces:**

```tsx
type Props = {reports: ChainReport[]; diagnoses: Diagnosis[];
  candidates: OptimizationCandidate[]; checkedAt: string};
export function MatrixWatchdogPanel(props: Props): React.ReactNode;
```

先顯示彩種、期數及各階段結果；展開後查看來源與恢復結果。持續讀取狀態不得自動觸發修復。後台維持既有管理員驗證。

- [ ] **Step 1: 新增狀態呈現及手機測試。**

```tsx
it('shows waiting recovery without a success label', () => {
  render(<MatrixWatchdogPanel checkedAt="2026-09-20T00:00:00Z"
    diagnoses={[]} candidates={[]} reports={[{lottery:'天天樂',
      drawPeriod:'12004',checkedAt:'2026-09-20T00:00:00Z',state:'WAITING',
      stages:[{stage:'analysis',state:'WAITING',source:'matrix_analysis_runs',
        observedAt:'2026-09-20T00:00:00Z',period:'12004',code:'RECOVERY_ACCEPTED'}]}]} />);
  expect(screen.getByText('等待完成')).toBeInTheDocument();
  expect(screen.queryByText('恢復成功')).not.toBeInTheDocument();
});
```

另測 UNKNOWN、部分讀取失敗、空候選、舊心跳、長錯誤文字、320px 畫面及鍵盤展開操作。

- [ ] **Step 2: Run。**

Run from apps/admin: `../../node_modules/.bin/vitest run src/MatrixWatchdogPanel.test.tsx src/system-status.test.ts src/system-status-ui.test.tsx`

Expected：新元件／契約先失敗。

- [ ] **Step 3: 沿用既有元件與樣式實作。**

```tsx
<details className="statusDetails">
  <summary>診斷證據</summary>
  <dl className="statusFacts">{/* 已清理的固定證據欄位 */}</dl>
</details>
```

不把所有服務訊息塞進同一個綠色「正常」。後台顯示各層實際結果，並將 deployment、資料完整性、恢復狀態分別表達。

- [ ] **Step 4: 最終驗收。**

執行 Task 1–6 列出的明確測試檔案；依 scoped selector 確認新增 SQL／Python／Edge 測試確實被選入。執行正式 build 與 admin build，檢查 exit status。手機視覺以 `tests/matrix-watchdog-panel.spec.ts` 驗證，不跑所有瀏覽器測試。

未完成的 runtime 憑證配置、Optimizer 頻率／保留決策分別列出，不把本地測試通過寫成正式上線成功。

- [ ] **Step 5: 獨立審查與交付。**

提交整合結果，附上基準 SHA、修改範圍、各指定測試結果、migration 順序及正式部署前條件。取得合併／部署授權後才修改正式設定。

部署順序：相容性 SQL → Recovery 服務 → Matrix Status Edge → admin-api Watchdog／Inspector → 後台。若 runtime 必要憑證或 migration 未就緒，完整功能不得宣稱已啟用。最後實際核對 CI 是否阻擋 Railway 部署，不只看 checkSuites 欄位。

Commit: `feat: expose verified Matrix operations in the admin panel`

## 本輪完成範圍

- 已重新查詢 GitHub／Supabase／Railway。
- 已取得最新 main 全部檔案並驗證 tree 一致。
- 已盤點指定期修復、計數、Runtime 證據的實際缺口。
- 已完成此書面實作計畫；尚未修改功能、執行 migration 或部署。

## 執行前審查

依 Superpowers writing-plans，書面計畫須由使用者審查，並選擇本對話直接執行或分工執行後再開始產品程式變更。這是流程要求，不是 GitHub／Supabase 權限不足。
