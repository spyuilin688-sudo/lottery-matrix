# 選號提醒的開獎日檢查

選號提醒（`bet_reminder`）採用台北日期：先確認該彩種當天開獎，再比對會員設定的提醒時間。原本每分鐘的 pipeline 和 dispatch 排程繼續使用；沒有符合日期及時間的提醒就不產生事件。

唯一日期判斷為 `private.notification_is_draw_day(lottery, taipei_date)`：

| 彩種 | 一般開獎日 |
| --- | --- |
| 今彩539 | 週一至週六 |
| 天天樂 | 每日 |
| 大樂透 | 週二、週五 |
|六合彩 | 香港賽馬會已確認的實際攪珠日期；不再以固定星期放行 |

台灣彩券一般開獎日參考[國庫署公益彩券問與答](https://www.nta.gov.tw/singlehtml/296?cntId=nta_49_296)。[香港賽馬會說明](https://special.hkjc.com/e-win/en-US/betting-info/marksix/lottery/)指出六合彩週末可能在週六或週日，應依當期公告登記改期，不能將兩天都當成固定開獎日。

`notification_time_events_tick` 在產生事件前使用此判斷。原有 `notification_member_matches` 在 fanout 及 Android `native_push_eligible` 的發送前檢查使用相同判斷。`notification_dispatch_claim` 也會重新檢查已入列或重試的 web 選號提醒；不符合者標記 `skipped / bet_reminder_not_eligible`，不刪除紀錄，每次最多處理既有 claim batch 大小。

`private.notification_reminder_is_due(payload, now)` 統一檢查提醒時間已到、提醒日期與發送日期為同一個台北日期，然後呼叫上述唯一開獎日判斷。這可阻止星期六的通知延遲到星期日、或舊通知在 Android 裝置重新啟用後補送。尚未到時間的提醒也不會提前發送。

開獎結果、Matrix 牌單、Matrix 狀態、到期提醒維持各自原有條件。延遲完成的上一期分析仍可發送，不以今天是否開獎阻擋它們。

## 加開、取消或改期

`private.notification_draw_day_overrides` 的具體日期優先於一般星期規則。此表不暴露於 Data API，會員與 service role 均無直接 CRUD 權限。

- 加開：登記新日期，`is_draw_day = true`。
- 取消：登記原日期，`is_draw_day = false`。
- 改期：同時將原日期登記為 `false`、新日期登記為 `true`，在同一筆 migration 交易內完成。
- 每筆須附官方公告 `source_url` 與 `reason`。查核正式公告後，用 `supabase migration new` 建立新 migration 並同步 main／production。
- 不因資料庫尚無當期獎號就判定不開獎：提醒是在開獎前發送。

## 六合彩官方日期自動同步

Railway 的既有 `worker_all`，以及單彩種六合彩入口，在爬蟲工作前呼叫 `sync_marksix_calendar`。Supabase 的 service-only acquire RPC 決定是否需要讀取官網並取得 5 分鐘 lease：

- 平時每日同步一次；既有 Worker 每 5 分鐘啟動並不等於每 5 分鐘抓官網。
- 有啟用的六合彩選號提醒時，在提醒前 20 分鐘內再確認；同一天的提醒前確認，相隔至少 15 分鐘才重新讀取。
- 重新確認期間先暫停採用舊日期；Worker 中斷時也不會繼續以舊日期發送。若來源讀取失敗，15 分鐘後可重試；Worker 中斷則在 5 分鐘 lease 到期後恢復。跨日的每日確認也可在上一輪 5 分鐘後執行。
- 最後確認的日期最長有效 26 小時；涵蓋範圍外、資料過期或尚未公告的新月份一律待確認。

來源是[香港賽馬會官方攪珠日期表](https://bet.hkjc.com/ch/marksix/fixtures)實際使用的公開 CMS 資料。程式從官網公開設定取得可輪換的 CMS 網站 key，不將它存入資料庫或前端；讀取 `NormalDrawDates` 與 `SnowballDrawDates`，不把預售日 `PresellDrawDates` 當成開獎日。

每次驗證當月完整日曆；若下月已公布，也同步下月。所有日期都明確標記開獎或不開獎，由 owned complete RPC 在同一交易更新現有 `notification_draw_day_overrides` 的 `hkjc` 資料。因此取消或改期會同時停用原日期、啟用新日期；人工登記的例外仍優先。沒有其他版本的日期 resolver。

管理後台既有「服務狀態」新增「六合彩開獎日曆」，透過服務專用唯讀 RPC 顯示已確認／待確認。正常休息日是健康狀態；無法確認日期才顯示暫停原因。狀態檢查不抓官網、不觸發通知。日期表若未反映臨時公告，仍可依上述人工例外處理，不能保證先於官方資料更新得知異動。

2026-09-13 直接讀取官方資料時，9 月 24 日（週四）未列為攪珠日；回歸 fixture 保留該月實際日期，驗證固定星期不會覆蓋官方安排。

## 驗證

`node --test supabase/tests/notification-reminder-draw-days.test.mjs`

`node --test supabase/tests/notification-marksix-calendar.test.mjs`

`cd services/matrix-api && uv run pytest tests/test_marksix_calendar.py tests/test_worker_entrypoint_notifications.py tests/test_worker_all.py -q`

`./node_modules/.bin/vitest run apps/admin/backend/notification-calendar-status.test.ts apps/admin/backend/connection-status.test.ts`

測試在隔離的 PGlite PostgreSQL 執行正式通知 migrations，覆蓋四彩種一週日程、時區邊界、日期例外、錯誤輸入、會員設定、去重、舊通知重試及其他通知相容性。正式環境只查日期 helper、既有紀錄、函式與權限；不執行測試推播，也不呼叫 pipeline 製造會員通知。
