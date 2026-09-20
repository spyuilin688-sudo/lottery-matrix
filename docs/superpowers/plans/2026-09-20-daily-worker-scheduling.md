# 每日工作排程 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. 由目前工作階段直接實作；不另派代理。

**Goal:** 按使用者指定時段查詢，取得最新一期後停止抓取，完成後結束工作；已開始的計算跨截止時間繼續完成。

**Architecture:** Railway 每日啟動既有工作服務一次，由服務內的協調流程安排當日檢查。沿用現有資料、分析進度、完成憑證與租約；重新啟動以持久進度恢復。主工作、天天樂抓取、自動修復共用相同時段規則，不改演算法與前端畫面。

**Tech Stack:** Python 3.12、現有 Railway 工作服務、Supabase PostgreSQL、TypeScript watchdog、pytest、Vitest。

**Spec:** `docs/superpowers/specs/2026-09-20-usage-optimization-scheduling-design.md`

## Global Constraints

- 今彩539、六合彩、大樂透：台北時間 20:30 起每 10 分鐘，01:00 起每 30 分鐘，06:00 截止新抓取。
- 天天樂：台北時間 09:30 起每 10 分鐘，14:00 起每 30 分鐘，18:00 截止新抓取。
- 已開始的計算截止後繼續保存至完成；不可將 running、租約占用或循環上限視為完成。
- 抓取成功後停止該彩種抓取；必要結果與原有發布流程完成後停止該彩種工作。
- 保留開獎日、六合彩日曆、天天樂日光節約與來源日期規則。
- 只執行直接相關測試，禁止全量測試。
- 合併、部署與正式設定修改不包含在建立草稿 PR 的授權中。

## 已核對的基準

- main：`39c56ef373cb61821df8db7e371a35e824958916`。
- 查詢優化草稿 PR：#707；遠端 tree 與已驗證的本機 tree 相同。
- 正式 `lottery-matrix`、`fantasy5-analysis` 均仍是 `3/10 * * * *`；`fantasy5-crawler` 為 `33 1,2 * * *`，三者 restart policy 均為 NEVER。本次只讀取設定。
- `worker._run_analysis` 有 450 次循環上限與 3 次連續失敗上限；`running` 仍可能需要後续執行接續。
- `fantasy5_railway_job` 目前重試上限 10 次，間隔 600 秒；不能直接沿用為新的 09:30–18:00 時段上限。
- watchdog 使用以開獎時刻為起點的另一套重試時間，需要同步修改。
- Railway 官方文件：cron 使用 UTC；前次仍執行時會跳過下一次，且平台不自動終止前次工作。來源：https://docs.railway.com/cron-jobs 、https://docs.railway.com/guides/cron-workers-queues 。

## Review Focus

1. 前一期已完成但當日尚未開獎：不得把舊完成憑證當作當日完成。
2. 計算跨過下一日啟動時間：Railway 可能略過下一次 cron，協調流程須接續當日工作，不能只結束舊工作便退出。
3. 截止時間後重啟：只恢復已開始的計算，不重新抓取或開始未啟動的分析。
4. 天天樂冬令時間：09:30 進入等待狀態，不得把來源尚未公布誤判為缺漏或完成。
5. 主工作已停止但 watchdog 仍派發：自動修復不能繞過抓取截止與完成條件。

---

### Task 1: 時段與檢查時刻的純函式

**Files:** Create `services/matrix-api/app/daily_schedule.py`; Create `services/matrix-api/tests/test_daily_schedule.py`.

**Interfaces:**

```python
@dataclass(frozen=True)
class DailyWindow:
    cycle_date: date
    starts_at: datetime
    slows_at: datetime
    closes_at: datetime

def daily_window(lottery: str, cycle_date: date) -> DailyWindow: ...
def next_check_at(window: DailyWindow, after: datetime) -> datetime | None: ...
def can_acquire(window: DailyWindow, now: datetime) -> bool: ...
```

- [ ] 寫失敗測試，使用固定台北時間，不用真實等待：

```python
w = daily_window('今彩539', date(2026, 9, 21))
assert w.starts_at.isoformat() == '2026-09-21T20:30:00+08:00'
assert w.closes_at.isoformat() == '2026-09-22T06:00:00+08:00'
assert next_check_at(w, w.starts_at) == w.starts_at + timedelta(minutes=10)
assert next_check_at(w, w.slows_at) == w.slows_at + timedelta(minutes=30)
assert can_acquire(w, w.closes_at) is False
assert next_check_at(w, w.closes_at) is None
```

- [ ] `uv run pytest tests/test_daily_schedule.py -q`，確認缺少行為造成失敗。
- [ ] 實作 `ZoneInfo('Asia/Taipei')` 時間計算：晚間跨日，天天樂同日；拒絕無時區 datetime 與未知彩種。下一次檢查取嚴格晚於 after 的時刻，不補發錯過的每一個時刻。
- [ ] 加入 20:29/20:30、00:59/01:00、05:59/06:00、09:29/09:30、13:59/14:00、17:59/18:00 與 UTC 輸入測試，執行同一檔案至通過，提交。

### Task 2: 每日協調與截止後續算

**Files:** Create `services/matrix-api/app/daily_runner.py`; Create `services/matrix-api/tests/test_daily_runner.py`.

**Interfaces:**

```python
@dataclass(frozen=True)
class DailyStep:
    state: Literal['waiting', 'running', 'complete']
    draw_period: str | None

def run_daily_cycle(window: DailyWindow,
                    step: Callable[[bool], DailyStep], *,
                    clock: Callable[[], datetime],
                    sleeper: Callable[[float], None]) -> DailyStep: ...
```

`step(allow_acquire)` 必須自行根據持久資料恢復工作；不能僅憑進程中的旗標判斷是否已開始。狀態為 complete 後不再呼叫 step；截止後 waiting 即停止，running 仍接續。實際單次運算不中途終止。

- [ ] 寫固定時鐘測試：第一次 running 跨截止、第二次 complete，確認截止後呼叫為 `step(False)`；第一步 complete 則之後零次讀取與零次等待。
- [ ] `uv run pytest tests/test_daily_runner.py -q`，確認失敗。
- [ ] 實作協調迴圈，等待下一個政策時刻；截止後有進度但暫時無法取得租約時沿用慢速間隔，不做無間隔重試。錯誤沿用現有可重試分類，不把錯誤轉成完成。
- [ ] 加入時鐘跳過多個檢查點、舊任務跨下一日啟動、新週期不得因 Railway 跳過 cron 而漏掉的測試。協調入口完成舊週期後重新評估目前週期，必要時接續；沒有有效新週期才退出。
- [ ] 同檔測試通過後提交。

### Task 3: 工作入口與持久進度接續

**Files:** Modify `services/matrix-api/app/worker_all.py`, `app/worker.py`, `app/analysis_worker.py`, `app/fantasy5_railway_job.py`; Create `tests/test_daily_worker_integration.py`; Modify `tests/test_worker_all.py`, `tests/test_fantasy5_railway_job.py`.

**Interfaces:** Task 2 的 `step(bool)`，包裝既有工作函式，不建立第二套演算法流程。

- [ ] 寫整合測試：舊日期的 ready 憑證仍須等待當期；當期確認後 source.fetch 次數不再增加；pipeline 返回 running 不可退出每日工作。
- [ ] `uv run pytest tests/test_daily_worker_integration.py tests/test_worker_all.py tests/test_fantasy5_railway_job.py -q`，確認新增案例失敗。
- [ ] `worker_all` 以既有完成憑證與當日預期日期判斷各彩種完成。未完成才呼叫既有 `run_scheduled_worker`；抓取開關與分析續算分開傳遞，禁止復用「allow_recovery_crawl」同時代表時段與人工修復。
- [ ] `analysis_worker` 保留直接單次執行入口，每日協調入口核對資料日期；截止後只續接開始時間早於截止且尚未完成的持久進度。沿用 `list_progress_for_periods` 與既有租約。
- [ ] `fantasy5_railway_job` 改由 DailyWindow 決定重試時段，取得預期日期結果後退出。冬令時間的來源可用時刻沿用現有判定，09:30 先等待，不提前補造資料或判斷成功。
- [ ] 檢查多彩種執行順序，保持現有計算並行度；單次長運算結束後重算下一次檢查時刻，不連續補跑錯過的 tick。文件明列「運算中的工作不重複啟動」，不宣稱分鐘級精準 SLA。
- [ ] 同檔案驗證通過後提交。再執行 `tests/test_worker_completion_cache.py`、`tests/test_analysis_worker_completed_idle_guard.py`、`tests/test_analysis_worker_notifications.py`、`tests/test_scheduled_worker_resume.py`，確認既有完成與通知條件保留。

### Task 4: 自動修復同步時段

**Files:** Modify `apps/admin/backend/watchdog.ts`, `services/matrix-api/app/targeted_recovery.py`; Create `apps/admin/backend/watchdog-daily-window.test.ts`; Modify `services/matrix-api/tests/test_targeted_recovery.py`.

**Interfaces:** 自動 crawler 派發受 DailyWindow 限制；分析派發須附既有 period 並檢查持久 startedAt。人工修復入口保持原明確權限，不與自動派發混用。

- [ ] 寫失敗測試：06:00/18:00 後來源缺漏不得自動派發 crawler；已開始而租約過期的分析仍可恢復；最新期所有必要结果已完成不得派發。
- [ ] `node_modules/.bin/vitest run apps/admin/backend/watchdog-daily-window.test.ts --reporter=dot` 與 `uv run pytest tests/test_targeted_recovery.py -q`，確認失敗。
- [ ] 在 `planWatchdogActions` 分開「可開始抓取」與「可續算」條件；不能把整份 snapshot 因時段關閉而直接 continue，否則會同時封鎖必要續算。保留當前 drawDays 日曆與有效租約跳過判斷。
- [ ] 自動 recovery 執行端再次核對截止，避免截止前排隊、截止後才開始抓取。保留原 period-bound 驗證，杜絕把舊期成功視為當期完成。
- [ ] 補測 13:59/14:00 重試間隔從 10 改 30 分鐘時，watchdog 不因等待超過舊 600 秒門檻而重複派發。指定相關 watchdog 測試及 targeted recovery 測試通過後提交。

### Task 5: Railway 設定與交付驗證

**Files:** Modify `services/matrix-api/railway.json`, `railway.fantasy5.json`, `tests/test_railway_cron_contract.py`; Create `services/matrix-api/railway.fantasy5-crawler.json`; Update scheduling spec with observed results.

- [ ] 新增設定合約測試，三服務的 UTC cron 目標分別為晚間 `30 12 * * *`、天天樂分析及抓取 `30 1 * * *`；startCommand 必須指向對應每日協調入口。
- [ ] `uv run pytest tests/test_railway_cron_contract.py -q`，确认新預期失敗，然後更新設定檔。不得假設修改 repository JSON 就會覆蓋 Railway 控制面的 cron。
- [ ] 驗證錯誤返回非零，正常完成返回零，關閉 HTTP／資料庫連線。檢查重啟設定時只恢復持久未完成工作，不讓程序失敗造成整天漏算；正式 restart policy 的具體設定需與已驗證的恢復行為一起提交部署清單。
- [ ] 執行 Tasks 1–4 列出的明確檔案與 `node_modules/.bin/tsc --noEmit`、`git diff --check`。不執行全專案測試。
- [ ] 更新草稿 PR：列出程式碼、指定測試結果、三服務正式設定所需變更與回復方式。尚未批准正式部署前，不修改 Railway 控制面或 Supabase 排程。

## 審閱結果與執行狀態

已逐項對齊使用者時段、取得後停止抓取、完成後停止、截止後續算。現有程式尚未實作此計畫；當前 PR #707 只包含查詢優化與文件。本計畫需審閱後才進入排程實作，避免將已核准的時段需求誤當成跨服務實作已完成。
