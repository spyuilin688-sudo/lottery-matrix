# 開獎通知與正式分析的執行順序

Pilio 只提供開獎結果通知。它不寫入 `lottery_draws`、首頁開獎資料、正式爬蟲狀態或演算法資料，也不推算期數。正式爬蟲仍沿用原本流程；該期完整分析完成後，才允許 Matrix 狀態通知，牌單通知還需要確認該期牌單已發布。

開獎結果與牌單通知內文的日期均取自對應開獎資料的 `drawDate`，格式為 `MM/DD(星期)`。舊版狀態／牌單事件缺少日期時，只查詢它自己的彩種與期數，不使用發送日期。天天樂補算歷史期數時，不發送舊期通知。

## 快速來源

依需求提供的時間範圍，每分鐘檢查一次（Asia/Taipei，含結束分鐘）：

| 彩種 | 時段 | 來源 |
| --- | --- | --- |
| 今彩539 | 20:35–20:40 | https://www.pilio.idv.tw/lto539/list.asp |
| 大樂透 | 20:55–21:00 | https://www.pilio.idv.tw/ltobig/list.asp |
| 六合彩 | 21:35–21:40 | https://www.pilio.idv.tw/ltohk/list.asp |

只接受頁面第一筆開獎資料，且日期必須是台北當日。日期不符、號碼未齊、重複或超出範圍都不發送。六碼彩種必須同時取得特別號，儲存時特別號置於第七碼；來源未提供開出順序，不推算開出順序。

SQL 唯一索引以「彩種＋開獎日期」去重，快速來源和正式來源無論誰先到，都共用一個結果通知事件。原有依會員、事件、管道的 outbox 去重仍有效。保留正式爬蟲的期數事件鍵回應，避免既有發送端誤判請求失敗。

成功取得結果後立即建立 outbox 並呼叫現有 dispatcher。若立即呼叫失敗，現有每分鐘 dispatcher 負責重試。若來源在上述時段內仍未提供完整當期結果，由正式爬蟲的結果通知補上。這是每分鐘輪詢，不保證與網站更新同一秒送達。

## 通知文案

- 選號提醒：`選號時間到了，記得完成你的選號。`
- 開獎結果：`09/05(六) 03-08-10-28-38`
- 臨界：`發現了極為罕見的版路！`
- 共振：`發現了具備強烈共振效應的版路！`
- 聚合：`發現了具備明顯規律集中性的版路！`
- 啟動：`發現了具備基本參考價值的版路！`
- 牌單：`09/05(六) 最新的牌單已經更新囉！`

通知標題、會員偏好、DORMANT 不通知的行為、到期提醒與系統公告不變。

## 部署與驗證

1. 部署更新後的正式 worker／天天樂 analysis worker，以及 `notification-ingest`。舊資料庫 renderer 仍可接受新增的日期欄位。
2. 部署 `notification-pilio`，使用 `--no-verify-jwt`；由既有 `MATRIX_NOTIFICATION_DISPATCH_TOKEN` 驗證伺服器呼叫。沿用 Supabase URL、service role 和現有 dispatcher，無須建立新金鑰。
3. 套用 `20260905205428_notification_fast_results.sql` 前，重新確認既有結果事件沒有同彩種、同日期的重複資料；Vault 中已有 `matrix_project_url` 與 `matrix_notification_dispatch_token`。不要輸出秘密值。
4. 套用 migration，建立跨來源唯一索引、更新文案及建立 `matrix-notification-pilio-minute` 排程。
5. 開獎時檢查新事件的來源、`drawDate`、`created_at` 及 outbox 狀態。正式資料到齊後確認結果事件仍只有一筆，狀態／牌單事件晚於完整分析完成。裝置實際收到推播需另行驗證。

回復時先停用新增的 `matrix-notification-pilio-minute` 排程；正式爬蟲與既有通知 dispatcher 可繼續運作。不要刪除已發送事件或 outbox 以免重複通知。

驗證包含：75 項 Python 通知／worker／牌單測試、71 項 Edge Function 測試、通知 handler TypeScript strict 檢查，以及 `supabase/tests/notification-fast-results.sql` 的本機隔離 PostgreSQL 相容環境測試（PGlite，cron／Vault／HTTP 使用本機替身）。三個來源的實際 DOM 已核對。正式資料庫只讀預檢顯示重複日期組數為 0，既有兩個 Vault 設定均存在。

另補三個彩種各一項來源隔離測試：通知端已有當日 Pilio 結果，且刻意使用與正式來源不同的號碼；正式來源未更新時，worker 仍回報 `not-acquired`，不執行新期分析或發布新期牌單。正式來源更新後，仍抓取及寫入正式資料，分析輸入與牌單內容均使用正式號碼，結果通知去重不阻止分析完成。SQL 驗證比較完整正式開獎資料前後內容，確認通知呼叫沒有新增、修改或刪除正式開獎資料。

正式資料庫只讀檢查顯示通知事件、outbox 及投遞紀錄沒有使用者定義的觸發器；讀取通知事件／outbox 的資料庫函式均屬通知流程。首頁與牌單取用正式資料，不從通知內容填入開獎快取。原 PR 程式版本 `aa59f8c8` 的完整 GitHub CI 已通過。

尚未在正式 Supabase 執行新 Edge Function 或發送實際通知；部署後仍須確認 Supabase 對 Pilio 的 HTTP 存取與手機收件。
