# 選號提醒的開獎日檢查

選號提醒（`bet_reminder`）採用台北日期：先確認該彩種當天開獎，再比對會員設定的提醒時間。原本每分鐘的 pipeline 和 dispatch 排程繼續使用；沒有符合日期及時間的提醒就不產生事件。

唯一日期判斷為 `private.notification_is_draw_day(lottery, taipei_date)`：

| 彩種 | 一般開獎日 |
| --- | --- |
| 今彩539 | 週一至週六 |
| 天天樂 | 每日 |
| 大樂透 | 週二、週五 |
|六合彩 | 一般週二、週四、週六；改期採下列日期例外 |

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

目前沒有自動取得官方未來改期公告的來源；這次新增的是可維護的例外日期機制，並未宣稱會自動同步所有未來加開或取消。

## 驗證

`node --test supabase/tests/notification-reminder-draw-days.test.mjs`

測試在隔離的 PGlite PostgreSQL 執行正式通知 migrations，覆蓋四彩種一週日程、時區邊界、日期例外、錯誤輸入、會員設定、去重、舊通知重試及其他通知相容性。正式環境只查日期 helper、既有紀錄、函式與權限；不執行測試推播，也不呼叫 pipeline 製造會員通知。
