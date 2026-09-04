# 樂彩 Matrix 自動通知派送設計

日期：2026-09-03
狀態：待使用者審核
基準：`main` @ `f3bfe6c71e4c57ea67ee1a758eff6efb6e0bd519`

## 1. 目的

補齊樂彩 Matrix 現有通知功能缺少的「事件產生 → 會員篩選 → 派送 → 紀錄」鏈路，同時保留目前已可運作的通知設定、Web Push 訂閱、Service Worker、測試推播與 `push_delivery_logs`。

本設計採用已確認的混合架構：

- Railway Worker：只在爬蟲、開獎資料或 Matrix 計算真正完成後，明確送出應用事件。
- Supabase：保存事件、去重、依會員通知設定展開收件人、建立 outbox、派送 Web Push、記錄結果。
- Supabase Cron：每分鐘處理待 fan-out / 待派送工作，並產生選號提醒、會員到期提醒等時間型事件。
- PWA：維持通知設定與 Push 訂閱管理，不承擔可信任事件產生或伺服器派送。
- 管理後台：保留既有測試 Push；正式系統通知改由相同事件入口送出，不另建第二條直送鏈路。

第一版刻意不讓 Railway 在事件建立後直接 kick Web Push。最長約一分鐘的排程延遲換取更單純的責任邊界與可靠 recovery；日後若確有低於一分鐘的通知延遲需求，可在不改資料模型的前提下增加安全的 dispatcher kick。

## 2. 現況基線

目前 PWA 通知頁已有 8 個設定鍵：

- `bet`：選號提醒
- `result`：開獎結果
- `win`：中獎通知
- `status`：Matrix 狀態
- `card`：Matrix 牌單
- `collision`：Matrix 摘星
- `expiry`：Matrix Pro
- `system`：系統通知

目前 Supabase 已有：

- `notification_settings`
- `member_push_subscriptions`
- `push_delivery_logs`

目前已有 `send-test-push` Edge Function，可完成實際 Web Push 並記錄 `push_delivery_logs`。目前沒有 notification event、outbox 或自動 dispatcher，因此現況只能確認「設定／訂閱／測試派送」可用，不能視為 8 類通知已自動運作。

## 3. 本次範圍

### 3.1 要完成

1. 建立單一、可信任、可重用的通知事件入庫核心。
2. 建立 Railway／管理後台可呼叫的受保護事件入口。
3. 建立全域事件去重機制。
4. 建立每會員、每通道的 outbox 去重機制。
5. 依 `notification_settings` 篩選應接收通知的會員。
6. 建立正式 Web Push dispatcher。
7. 保留每個實際 Push endpoint 的派送紀錄。
8. 支援失敗重試、永久失敗處理及失效訂閱停用。
9. 支援 Railway 事件與 Supabase Cron 時間事件共用同一條資料管線。
10. 先接規格明確的通知類型，再逐步擴充。

### 3.2 不包含

- 不重做通知頁 UI。
- 不重做 `notification_settings`。
- 不重做 Push 訂閱流程。
- 不重做 `push-service-worker.js`。
- 不改 Matrix 演算法與爬蟲計算邏輯。
- 不改啟動碼或推薦碼功能。
- 不因測試而自行建立或修改正式會員、啟動碼、推薦碼或付款資料。
- 不自行發明「中獎通知」與「Matrix 摘星」尚未確認的業務觸發規則。
- 第一階段不新增管理後台監控 UI；先以資料表與既有 delivery log 驗證管線。

## 4. 架構

```text
Railway crawler / Matrix worker
        │
        │ 工作真正完成後
        ▼
notification-ingest Edge Function
        │
        ▼
private.notification_event_enqueue(...)
        │
        ▼
notification_events ── UNIQUE(event_key)
        │
        │ Supabase Cron：每分鐘 fan-out
        ▼
notification_outbox ── UNIQUE(event_id, member_id, channel)
        │
        │ Supabase Cron：每分鐘 drain
        ▼
notification-dispatch Edge Function
        │
        ├─ member_push_subscriptions
        ├─ Web Push
        └─ push_delivery_logs

Supabase Cron（時間型通知）
        │
        └─ private.notification_event_enqueue(...)
                 │
                 └────────→ 同一 notification_events / outbox 管線

管理後台（正式系統通知）
        │
        └─ notification-ingest Edge Function
```

重點：事件來源不直接發 Push。所有正式通知都先成為可去重、可追蹤的 event，再由排程處理成 outbox。

## 5. 責任邊界

### 5.1 Railway Worker

Railway 只負責判斷「應用工作已完成」。例如：

- 新一期開獎資料已成功取得且已正式寫入。
- Matrix 狀態已完成本期計算且結果已正式寫入。
- Matrix 牌單已完成產生且資料已正式寫入。

Railway 不負責：

- 查詢所有會員。
- 判斷每位會員通知開關。
- 查 Push subscription。
- 直接發 Web Push。
- 自行做 Push retry。
- 啟動 Supabase dispatcher。

如此可避免 Railway retry、重新計算或爬蟲重跑時直接造成重複推播。

### 5.2 Supabase

Supabase 負責：

- 接收可信任事件。
- 事件去重。
- 會員通知偏好判斷。
- fan-out 成每會員 outbox。
- Web Push 派送。
- retry、失效訂閱停用與派送紀錄。
- 每分鐘 recovery / drain。
- 時間型通知排程。

### 5.3 PWA

PWA 只負責：

- 讓會員修改通知設定。
- 註冊／停用 Web Push subscription。
- 接收 Service Worker Push。

瀏覽器端不得直接新增可信任的 `notification_events` 或 `notification_outbox`。

## 6. 資料模型

### 6.1 `notification_events`

一筆代表一個邏輯事件，而不是一位會員的一次通知。

| 欄位 | 用途 |
|---|---|
| `id uuid pk` | 事件 ID |
| `event_key text not null unique` | 全域去重鍵 |
| `event_type text not null` | 事件類型 |
| `source text not null` | `railway` / `cron` / `admin` |
| `payload jsonb not null` | 事件資料 |
| `occurred_at timestamptz not null` | 真正發生時間 |
| `fanout_status text not null` | `pending` / `processing` / `complete` / `failed` |
| `fanout_attempt_count int not null default 0` | fan-out 嘗試次數 |
| `next_fanout_at timestamptz` | 下次可處理時間 |
| `processing_started_at timestamptz` | worker claim 時間 |
| `last_error text` | 最近一次 fan-out 錯誤 |
| `created_at timestamptz not null default now()` | 建立時間 |
| `updated_at timestamptz not null default now()` | 更新時間 |

`event_key` 必須 UNIQUE。

### 6.2 `notification_outbox`

一筆代表一位會員透過一個通知通道應接收的一個事件。

| 欄位 | 用途 |
|---|---|
| `id uuid pk` | outbox ID |
| `event_id uuid not null` | 對應 `notification_events.id` |
| `member_id uuid not null` | 收件會員 |
| `channel text not null` | 第一版固定 `web_push` |
| `notification_payload jsonb not null` | fan-out 時已固定的 title/body/url/tag |
| `status text not null` | `pending` / `processing` / `sent` / `failed` / `skipped` |
| `attempt_count int not null default 0` | 派送嘗試次數 |
| `next_attempt_at timestamptz` | 下次 retry 時間 |
| `processing_started_at timestamptz` | dispatcher claim 時間 |
| `last_error text` | 最近錯誤 |
| `processed_at timestamptz` | 最終完成時間 |
| `created_at timestamptz not null default now()` | 建立時間 |
| `updated_at timestamptz not null default now()` | 更新時間 |

約束：

```text
UNIQUE(event_id, member_id, channel)
```

同一事件就算 fan-out 重跑，也不能替同一會員再建立第二筆相同 Web Push 工作。

### 6.3 `push_delivery_logs`

沿用現有表，保持「實際對某一 Push subscription endpoint 發送後的結果」用途，不拿來替代 outbox。

層級：

```text
1 notification_event
  → N notification_outbox（每會員）
      → N push_delivery_logs（會員可能有多裝置 subscription）
```

## 7. 單一事件入庫核心

新增內部 DB function：

```text
private.notification_event_enqueue(...)
```

它是唯一負責建立 `notification_events` 的核心，Railway、Cron、管理後台最後都必須收斂到這個 function。

責任：

1. 驗證已標準化的 event type、event key、source、occurred_at、payload。
2. 依 `event_key` idempotent insert。
3. duplicate 時返回既有事件，不建立第二筆。
4. 新事件初始 `fanout_status=pending`。

權限：

- 不授權 `anon`。
- 不授權一般 `authenticated`。
- 只允許 Supabase 內部受信任 server-side 路徑呼叫。
- function 固定安全 `search_path`，不依賴可被 client 影響的 schema resolution。

## 8. Railway／管理後台事件入口

新增 `notification-ingest` Edge Function。

### 8.1 驗證

使用獨立伺服器端秘密：

```text
MATRIX_NOTIFICATION_INGEST_TOKEN
```

Railway、需要發正式系統通知的管理後台及 Supabase Edge Function 環境保存該值。不得放進 Vite 環境變數、瀏覽器 bundle 或 PWA localStorage。

`source` 只用於可觀測性；真正的信任邊界是伺服器秘密與管理後台原有角色驗證，不能只因 request body 寫了 `source=admin` 就視為管理員。

### 8.2 輸入

最小格式：

```json
{
  "eventKey": "lottery_result:539:115203",
  "eventType": "lottery_result",
  "source": "railway",
  "occurredAt": "2026-09-03T00:00:00Z",
  "payload": {}
}
```

Edge Function 必須先驗證允許的 `eventType`、必要 payload 欄位及 `source`，再呼叫 `private.notification_event_enqueue(...)`。不可接受任意未知事件型別。

### 8.3 重複事件行為

第一次：

```text
notification_event_enqueue
→ created = true
```

Railway 因 retry 再送相同 `event_key`：

```text
UNIQUE 命中
→ 不建立第二筆
→ created = false
→ HTTP 200
```

重複不是錯誤，不應導致 producer 無限 retry。

第一版 ingress 只負責事件可靠入庫，不直接 fan-out、不直接呼叫 Push dispatcher。

## 9. Event key 規則

事件去重鍵必須由穩定業務識別值組成，不能使用隨機 UUID 或「目前時間」當主要識別。

第一版：

```text
lottery_result:<lottery_code>:<period>
matrix_status:<lottery_code>:<period>:<status>
matrix_card:<lottery_code>:<period>
system_notice:<notice_id>
bet_reminder:<member_id>:<lottery_code>:<scheduled_at>
membership_expiry:<member_id>:<expiry_date>:<days_before>
```

規則：

- 同一期開獎重抓不重複通知。
- Matrix 相同狀態重算不重複通知；若同一期真正產生另一個需通知狀態，key 不同。
- Matrix 牌單第一版一彩種一期最多一個正式通知事件，不額外要求目前不存在的 `card_version`。
- 未來若產品明確要求同一期牌單「重新發布也再次通知」，再於新規格中增加正式版本識別，不在第一版先行創造依賴。
- 排程通知使用會員、目標時間／到期日與提醒提前天數組成 key。

## 10. 第一版事件與現有設定對照

### 10.1 立即接入

| event type | 設定鍵 | 來源 | 會員篩選 |
|---|---|---|---|
| `lottery_result` | `result` | Railway | `settings.result=true` 且彩種存在於 `selectedOptions.result` |
| `matrix_status` | `status` | Railway | `settings.status=true`、彩種存在於 `selectedOptions.status`、狀態存在於該彩種 `statusOptions` |
| `matrix_card` | `card` | Railway | `settings.card=true` 且彩種存在於 `selectedOptions.card` |

### 10.2 第二階段接入

| event type | 設定鍵 | 來源 | 會員篩選 |
|---|---|---|---|
| `bet_reminder` | `bet` | Supabase Cron | `settings.bet=true`，依該彩種 `betTimes` 的有效時間產生 |
| `membership_expiry` | `expiry` | Supabase Cron | `settings.expiry=true` 且提前天數存在於 `selectedOptions.expiry` |
| `system_notice` | `system` | 管理後台 | `settings.system=true` 且通知分類存在於 `selectedOptions.system` |

`system_notice.payload` 必須帶現有設定可識別的通知分類，例如「維護」或「更新」，fan-out 只選擇有勾選該分類的會員。

`membership_expiry` 必須讀取現有會員方案／到期日的 server-side source of truth，不建立第二份平行到期資料；實作前先定位目前會員 API 使用的實際來源欄位並直接沿用。

### 10.3 暫不自動接入

- `win`／中獎通知：目前尚未確認應以哪份會員選號／下注資料與開獎資料比對，也未確認「彩種通知、獎金通知」完整業務規則。
- `collision`／Matrix 摘星：通知頁已有設定資料，但自動通知成立事件的完整定義尚未確認。

規則確認前，兩者保持現有設定資料，不建立假的自動觸發。

## 11. 通知內容生成

通知內容在 fan-out 時由 server-side renderer 產生並寫入 `notification_outbox.notification_payload`。retry 重用同一 snapshot，不因部署新版程式而改變已排程通知內容。

第一版格式：

```json
{
  "title": "...",
  "body": "...",
  "url": "/",
  "tag": "..."
}
```

第一版全部使用 `/` 作為安全 deep link，避免在尚未逐一確認 Router 穩定路徑前寫入錯誤頁面。後續可在不改事件模型的情況下逐類加入正式 deep link。

`tag` 使用 `event_key` 的穩定衍生值。

第一版文案規則：

- 開獎結果：`<彩種> 開獎結果`；body 含期數及開獎號碼。
- Matrix 狀態：`Matrix 狀態｜<彩種>`；body 含期數與狀態。
- Matrix 牌單：`Matrix 牌單｜<彩種>`；body 表示該期牌單已更新。
- 選號提醒：`<彩種> 選號提醒`；body 表示已到會員設定提醒時間。
- Matrix Pro：`Matrix Pro 即將到期`；body 含剩餘日數或到期日。
- 系統通知：標題、內容與分類由經授權管理後台輸入，但必須通過長度與分類驗證。

## 12. Fan-out processor

Supabase 每分鐘處理 `notification_events`。

流程：

1. 原子 claim `fanout_status=pending` 或到 `next_fanout_at` 的事件；並行 worker 不得 claim 同一列。
2. 設為 `processing` 並記錄 `processing_started_at`。
3. 依 event type 找出符合通知設定的有效會員。
4. 產生固定 `notification_payload`。
5. `INSERT ... ON CONFLICT DO NOTHING` 建立 outbox。
6. 成功後 event → `complete`。
7. 暫時錯誤時增加 attempt、保存 `last_error`、設定 `next_fanout_at` 後回到可重試狀態。
8. 超過 fan-out retry 上限後 event → `failed`，保留錯誤供查核，不靜默丟失。

`processing_started_at` 超過 5 分鐘的事件視為 stale，可被下一次 recovery 重新放回待處理；outbox UNIQUE 使重跑 fan-out 不會重複建立會員工作。

## 13. Dispatcher

新增正式 `notification-dispatch` Edge Function。

它只能消費資料庫中已建立的 outbox，不能讓 PWA 傳入任意 `userId/title/body` 後直送。

流程：

1. 原子 claim 一批到期 `pending` outbox；並行 dispatcher 必須避免 claim 同一列。
2. 取得該會員 enabled 的 `member_push_subscriptions`。
3. 對每個 subscription 執行 Web Push。
4. 每次 endpoint 嘗試都寫 `push_delivery_logs`。
5. 更新 subscription 成功／失敗時間。
6. HTTP 404／410 的 subscription 立即停用。
7. 至少一個有效 subscription 成功：outbox → `sent`。
8. 完全沒有 enabled subscription：outbox → `skipped`，原因 `no_enabled_subscription`。
9. 所有 subscription 都是永久失效：outbox → `skipped`，保留原因。
10. 暫時性失敗：增加 `attempt_count` 並設定 `next_attempt_at`。
11. 超過最大 retry：outbox → `failed`。

第一版 retry 上限固定 5 次，間隔約 1、2、5、15、30 分鐘；永久錯誤不重試。

`processing_started_at` 超過 5 分鐘的 outbox 視為 stale，可由下一次 recovery 重新 claim。

## 14. Web Push 共用實作

既有 `send-test-push` 已包含 VAPID、Web Push、delivery log 與 404/410 subscription 停用邏輯。

正式實作時，把「對一個 subscription 發 Web Push並紀錄結果」抽成 Supabase Edge Functions 共用 server-side 模組，再讓：

- `send-test-push` 繼續做人工診斷。
- `notification-dispatch` 做正式 outbox 派送。

兩者共用底層 delivery primitive，避免測試通知與正式通知對 404/410、log 欄位或 VAPID 行為形成兩套規則。

## 15. Supabase Cron

第一版固定每分鐘執行一次 notification pipeline drain。

### 15.1 時間型事件產生

每分鐘檢查：

- `bet_reminder`
- `membership_expiry`

符合條件時直接呼叫同一個 `private.notification_event_enqueue(...)`；event key UNIQUE 保證 Cron 重跑或同一分鐘重入不會重建相同事件。

### 15.2 Fan-out / recovery

每分鐘處理：

- `fanout_status=pending` 且已到 `next_fanout_at` 的 event。
- 超過 5 分鐘卡在 `processing` 的 stale event。

### 15.3 Dispatcher drain / recovery

每分鐘觸發 `notification-dispatch`，處理：

- `status=pending` 且已到 `next_attempt_at` 的 outbox。
- 超過 5 分鐘卡在 `processing` 的 stale outbox。

因此 Railway 成功把 event 入庫後即可結束本次通知責任；即使之後某一次 Cron 或 Edge Function 暫時失敗，下一分鐘仍能 recovery。

## 16. 安全

1. PWA 的 `anon`／一般 `authenticated` 不能 INSERT/UPDATE `notification_events` 或 `notification_outbox`。
2. `private.notification_event_enqueue` 不暴露給一般 client。
3. Railway／管理後台只能透過受保護 `notification-ingest` 建正式 server event。
4. `notification-dispatch` 只能由 Supabase 排程／受信任 server 呼叫，不能公開給一般會員任意觸發。
5. VAPID private key、Supabase service role、ingest token 不得出現在前端。
6. `notification_payload` 的 title/body/url 必須由 server-side renderer 或受驗證管理後台輸入產生，不接受一般會員自訂內容。
7. event/outbox 表使用 RLS／grants 封鎖一般 client 寫入；server-side SECURITY DEFINER function 固定 `search_path` 並限制 EXECUTE grant。
8. 管理員正式系統通知保留既有角色驗證及審計政策；本設計不放寬管理員權限。

## 17. 一致性與重複處理

必須同時具備兩層 idempotency：

```text
notification_events.event_key UNIQUE
notification_outbox(event_id, member_id, channel) UNIQUE
```

因此以下情況都不能造成第二筆相同通知工作：

- Railway HTTP retry。
- Railway process restart。
- 同一期資料重抓。
- 同一期 Matrix 計算重跑但邏輯事件未改變。
- fan-out worker crash 後重跑。
- Cron 同一分鐘重入。
- stale recovery。

Push 網路層無法提供嚴格 exactly-once，因此系統目標是：

- DB event/outbox 建立以 idempotency 達成唯一工作。
- Push 派送採 at-least-once retry，但用 outbox claim、穩定 `tag` 與 endpoint log 將重複風險降到最低。

不得宣稱 Web Push 本身具有嚴格 exactly-once 保證。

## 18. 失敗處理

| 情況 | 行為 |
|---|---|
| duplicate event key | 200，返回既有事件，不重建 |
| fan-out 暫時 DB 錯誤 | event retry |
| 無符合會員 | event complete，0 outbox |
| 會員無 enabled subscription | outbox skipped |
| endpoint 404/410 | 停用 subscription，不 retry 該 endpoint |
| Push 暫時性錯誤 | outbox retry |
| retry 超過上限 | outbox failed |
| worker crash 卡 processing | 5 分鐘後 stale recovery |
| payload 不符合事件 schema | ingress 4xx，不建立 event |
| 未授權 ingress | 401/403，不建立 event |

## 19. 可觀測性

第一階段不增加新管理後台 UI，但資料必須足以回答：

- 某一期事件有沒有建立？
- 是否因 duplicate 被去重？
- fan-out 是否完成？
- 產生多少會員 outbox？
- 哪些 outbox sent / failed / skipped？
- 某會員有幾個 Push endpoint？
- 每個 endpoint 最近發送結果是什麼？

資料來源：

```text
notification_events
notification_outbox
member_push_subscriptions
push_delivery_logs
```

既有管理後台 `send-test-push` 保留，用於確認單一會員瀏覽器 Push 基礎能力；它不等同正式事件派送成功。

## 20. 測試策略

### 20.1 資料庫／RPC

至少驗證：

- duplicate `event_key` 只保留一筆 event。
- duplicate fan-out 只保留一筆 `(event, member, channel)` outbox。
- `result` 彩種篩選正確。
- `status` 彩種＋狀態篩選正確。
- `card` 彩種篩選正確。
- 關閉通知的會員不建立 outbox。
- 未登入／一般 authenticated client 無法新增 event/outbox。
- Cron 產生同一時間型事件兩次仍只有一筆。
- stale event/outbox recovery 正確。

### 20.2 Edge Function

至少驗證：

- 未授權 ingest 被拒絕。
- invalid event schema 被拒絕。
- valid event 可入庫。
- dispatcher 不接受任意前端自訂收件人直送。
- 404/410 subscription 會停用。
- transient failure 進入 retry。
- 任一 endpoint 成功時會員 outbox 成為 sent。
- 無 subscription 時成為 skipped。

### 20.3 整合

順序：

```text
事件 ingress / Cron enqueue
→ event 去重
→ fan-out
→ outbox
→ dispatcher
→ Web Push mock / controlled subscription
→ push_delivery_logs
```

先使用測試／受控會員與可撤銷 subscription 驗證。未經使用者明確授權，不用正式會員資料製造通知、啟動碼、推薦碼或付款狀態做 E2E。

## 21. 上線順序

### Phase 1：基礎管線

1. migrations：`notification_events`、`notification_outbox`、constraints、indexes、RLS/grants。
2. `private.notification_event_enqueue`。
3. `notification-ingest`。
4. fan-out processor。
5. `notification-dispatch`。
6. 與既有 Web Push delivery primitive 共用化。
7. Cron 每分鐘 fan-out / dispatch / stale recovery。
8. 自動化測試。

### Phase 2：第一批實際 Railway 事件

1. `lottery_result`
2. `matrix_status`
3. `matrix_card`

每一類必須先確認 Railway 真正「完成」的 commit point，再在該點 emit；不能在計算開始或資料尚未 committed 時提早建立通知事件。

### Phase 3：時間型／後台事件

1. `bet_reminder`
2. `membership_expiry`
3. `system_notice`

全部走同一 event/outbox/dispatcher。

### Phase 4：待規格事件

業務規則確認後才加入：

- `win`
- `collision`

## 22. 驗收條件

只有同時符合下列條件，才能把「自動通知功能」標記為可正常使用：

1. Railway 可在受控測試事件完成後建立正式 event。
2. duplicate event 不會建立第二筆。
3. 會員設定能正確決定是否建立 outbox。
4. dispatcher 能實際送到受控瀏覽器 subscription。
5. `push_delivery_logs` 有成功紀錄。
6. 同一事件 retry 不會造成第二筆會員 outbox。
7. 404/410 subscription 能正確停用。
8. 暫時性錯誤可重試並達到最終狀態。
9. Cron 可補處理 pending/stale event/outbox。
10. 一般 PWA 使用者無法偽造 event 或指定其他會員收件。

完成結構但未通過上述 E2E 時，只能稱為「已實裝／鏈路完整」，不能稱為「已實際成功驗證」。

## 23. 與啟動碼／推薦碼的關係

啟動碼與推薦碼維持既有實作，不納入此次通知子系統修改。

它們的正式 E2E 驗證應另外進行，避免為測試通知而同時改動會員方案、推薦關係或 production 資料，增加除錯變數。

## 24. 最終設計決策

固定原則：

- **事件來源明確，不用隱性資料表 Trigger 猜測工作是否完成。**
- **Railway 只 emit event，不直接 Push，也不啟動 dispatcher。**
- **Railway、Cron、管理後台最後都收斂到同一事件入庫核心。**
- **Supabase 擁有事件、偏好、outbox、dispatcher、retry、recovery 與紀錄。**
- **第一版 Supabase 每分鐘處理 fan-out / dispatch，接受最長約一分鐘排程延遲。**
- **`event_key` + outbox UNIQUE 雙層去重。**
- **正式 Push 與測試 Push 共用底層 delivery primitive，但保留不同入口與用途。**
- **第一版只接規格已明確的通知，不自行補猜 `win` / `collision`。**
- **不改現有通知設定 UI、Push subscription 與 Service Worker。**
