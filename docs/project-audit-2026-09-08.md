# 樂彩 Matrix 專案檢查與 LINE 註冊試用

檢查日期：2026-09-08。來源基線：`5f74b42ae199dd58beaf3fa86d06bf482a6eda12`（main，PR #441）。

本報告區分正式環境讀取、程式／限定測試與尚未完成的真實帳號操作。不是所有功能皆無缺陷的保證。

## 本次實作

- 新建且具有 Supabase `custom:line` 已驗證身分的會員，於伺服器建立會員當下開始天衍 48 小時、天工 24 小時試用。
- 試用時間使用不可由會員修改的 `members.line_trial_started_at`；重複登入不重新計時、既有會員不回填、停用會員不得使用。原付費方案與其他推薦／探索權限保留。
- Supabase migration `20260908035518_line_registration_algorithm_trials` 已先於前端部署套用。
- 首次進入首頁，在原啟動畫面結束後顯示既有黑金 `AppDialog`，說明「我的」→「LINE 登入」免費註冊、Pro 演算法試用及首頁 Matrix Core 探索入口。「免費註冊」開啟會員頁；「知道了」／Escape 關閉。
- 相同瀏覽器已讀後不重複提示；OAuth 回傳與非首頁路徑不提示。瀏覽器拒絕儲存時，當次掛載仍可正常操作且不重複。
- 修正共用對話框在 React StrictMode effect 重播後無法繼續處理佇列的問題。

## 正式環境與功能結果

| 項目 | 結果 | 證據及界線 |
| --- | --- | --- |
| Railway API | 讀取正常 | `/health` 200，版本符合來源基線，回報 DB／adminApi 正常；本表以下 17 次 HTTP 探測全為 200 |
| 四彩最新開獎 | 正常 | 今彩539 `115000217`、六合彩 `026096`、大樂透 `115000085`、天天樂 `11993` |
| 狀態／探索 | 遊客讀取正常 | 四彩 Matrix status 與二期標準探索各 4 次成功；遊客狀態明細鎖定；探索結果筆數分別 9／31／23／10 |
| 天衍／天工試用 | DB 實裝並通過交易測試 | 以回滾的合成身分，經正式身分同步 trigger 建立會員，呼叫真實儲存結果 RPC；不是外部 LINE OAuth 實測 |
| Supabase API 部署 | 存在 | 查核的 26 個前端 RPC 名稱均已部署，8 個 Edge Functions 為 ACTIVE |
| 資料儲存 | 正常，部分舊資料不完整 | 27,879 筆開獎資料；球數、超範圍與同筆重複球異常均為 0；六合彩缺日期見待辦 |
| 爬蟲／演算 | 最近執行正常 | 四彩爬蟲成功，未見錯誤或 recovery exhausted；最近完整演算約 166／439／506／80 秒 |
| 排程／通知 | 最近執行正常 | 5 個 Supabase 排程各最近一小時 60 次成功；近 3 日 delivery sent 24，outbox sent 19、skipped 100，未見 pending／failed；這是查核時快照 |
| AppDeploy 管理後台 | 部署及登入入口正常，內頁未實際登入 | `matrix-sanqwn` ready，無部署錯誤；watchdog 最近成功、失敗數 0；瀏覽器載入管理員登入表單 |
| 管理員登入與權限 | 已實裝，限定測試通過 | 密碼驗證、24 小時 HttpOnly cookie、停用／到期 session 拒絕、權限模組存在；查核時 7 位啟用管理員均已設定密碼，14 個 session 全過期，故未驗證真實內頁寫入 |
| 推薦碼 | 已實裝 | 本人碼摘要、提交 RPC、LINE 身分、防自薦、每人一次與交易鎖存在；正式資料有 1 筆有效邀請 |
| 啟動碼 | 已實裝，停用檢查有缺口 | 7／15／30／60／90／365 天與永久碼規則存在；正式資料有 2 筆已兌換碼；未使用真實碼測試消耗 |
| 推薦獎勵 | 門檻演算已實裝，撤銷流程未完整 | 依確認付款計算有效推薦，10／15／30／50 門檻與對應權限存在且測試通過；目前正式資料未到獎勵門檻；退款／刷退見待辦 |
| 前端快取 | 已實裝 | latest／history 記憶體＋localStorage 5 分鐘，演算結果記憶體 60 秒、依會員／session 隔離；登入登出清除、舊回應丟棄；Service Worker 只快取靜態 build，不快取 API／RPC |
| 筆記本 | 本機保存已實裝 | localStorage 與 JSON 備份；沒有雲端同步，也沒有按帳號分開本機 keys |
| 首訪引導 | 行為測試與瀏覽器通過 | 真實預覽看到完整說明，免費註冊導向既有 LINE 會員頁，回首頁不重現，Matrix Core 進入探索；視窗寬 280px、按鈕高 44px，無內容水平溢出 |

PWA 的天衍／天工資料路徑是 Supabase RPC。`backend/` 的 TypeScript entitlement 模組也已同步修改，但不得將它描述成 Railway Python API 的天衍／天工正式路由。

## 尚存缺口與限制

| 優先度 | 項目 | 位置／影響 |
| --- | --- | --- |
| 高 | 啟動碼兌換沒有檢查會員停用狀態 | `redeem_activation_code` 現行 SQL：保留 JWT 的停用會員可能兌換碼；演算權限仍會拒絕停用會員。此檢查未在本次改寫 |
| 高 | 退款／刷退後的完整推薦撤銷流程未找到 | 付款狀態及管理操作目前集中在 pending／confirmed／rejected；取消訂閱只關閉續訂，未看到已確認付款退款後連動撤銷獎勵的完整入口。會員頁已提及撤銷規則，實作尚未完整 |
| 中 | 後台 Pro 統計未排除到期／停用會員 | `apps/admin/backend/admin-data.ts` 的 Pro 計數依方案分類，未同時判斷到期與停用；目前既有 2 位年繳會員仍有效，未觀察到現場誤差 |
| 中 | 筆記本未按會員隔離 | 同一瀏覽器切換帳號可看到同一組本機筆記；未雲端同步；跨裝置不能自動取得 |
| 中 | 六合彩 1,480 筆舊資料缺 `draw_date` | 影響日期查詢完整性；最新期資料正常，沒有猜日期回填 |
| 低 | 試用期限與前端 60 秒結果快取 | 伺服器在 24／48 小時界線拒絕新 RPC；到期前已取得的相同結果，可能在到期後最多約 60 秒仍命中本機快取，不是伺服器延長試用 |
| 低 | 計算機所選號碼離頁後重設 | 選號使用頁面 state；部分模式／欄數設定有 30 分鐘暫存 |
| 待驗證 | 真實 LINE 新帳號註冊與實體手機 PWA 回傳 | SQL、元件與桌面瀏覽器驗證無法取代 LINE 外部授權及 Android／iOS 實機測試 |
| 待驗證 | 真實管理員內頁及寫入 | 沒有有效管理員登入工作階段，未新增真實管理員、付款或兌換記錄 |
| 部署基線 | FastAPI Cloud 既有 check failure | 基線提交的 `FastAPI Cloud - lottery-matrix` 已失敗；三個 Railway deployment status 成功。沒有將 FastAPI Cloud 失敗算成通過 |

Premium strict 靜態掃描列出兩項既有 actionless-button：`src/features/MatrixTiangongPage.tsx` 的固定「五十期」按鈕與 `src/__tests__/TianyanExpandedLayoutPatch.test.tsx` 的測試 fixture。前者是真實介面可改善項目、後者是測試假元件；本次新增引導未新增掃描違規，未把整體掃描標為通過。

## 驗證紀錄

遵循 `AGENTS.md`，只執行明確檔案的限定測試，沒有執行全量測試。

- 試用與前端整合：11 檔、64 tests 通過。
- API／cache／session：11 檔、112 tests 通過。
- 後台／推薦／啟動碼：11 檔、140 tests 通過。
- Premium 合約：`node --test tests/premium-contract.test.mjs`，6 tests 通過。
- `npm run build:pages` 通過（包含 TypeScript 與 27 個受保護 mobile runtime 檔案檢查）；有既有大 bundle 警告。
- 新試用 SQL 測試與 migration 同交易執行並成功；測試身分與會員回滾。套用後仍為原 5 位會員、既有 trial 非空數 0、合成測試 user 數 0、trial trigger 存在。
- SQL 驗證包含非 LINE 不授予、既有會員不回填、重複 bootstrap 不重算、48／24 小時權限、未授予其他探索範圍、天衍 13 期全範圍可讀、天工可讀、到期直接 RPC 拒絕、未來時間與停用拒絕、會員不能更新試用時間；TypeScript 測試另包含付費方案維持權限。
- 兩位獨立唯讀審查者未找到試用或首訪引導的阻擋性缺陷；60 秒快取風險保留於上表。
- 瀏覽器檢查採桌面 viewport 及既有手機寬版面，未聲稱完成獨立手機 viewport／實機 QA。部分本機二進位素材未完整取回；發布必須使用保留原始素材的 GitHub tree，不能上傳本機不完整 dist。

整合測試命令：

```sh
./node_modules/.bin/vitest run backend/line-registration-trials.test.ts backend/matrix-entitlements.test.ts backend/matrix-member-auth.test.ts backend/matrix-tianyan-routes.test.ts backend/matrix-tiangong-routes.test.ts src/dialog/AppDialog.test.tsx src/onboarding/FirstVisitGuide.test.tsx src/__tests__/HomepageStatusRouting.test.tsx src/__tests__/HomepageStatusRefresh.test.tsx src/__tests__/FeaturePageLoadRecovery.test.tsx src/__tests__/FeaturePageStartup.test.tsx --maxWorkers=2
```

## HTTP 探測清單

Railway base：`https://heartfelt-generosity-production-9f2b.up.railway.app`

| 方法 | 路徑 | 次數 |
| --- | --- | ---: |
| GET | `/health` | 1 |
| GET | `/api/matrix/latest/{今彩539,六合彩,大樂透,天天樂}`（彩種 URL encoded） | 4 |
| GET | `/api/matrix/history/六合彩?limit=10` | 1 |
| GET | `/api/matrix/cards/今彩539?format=png` | 1 |
| POST | `/api/matrix/tongxing` | 1 |
| POST | `/api/matrix/number-reference` | 1 |

Supabase base：`https://wcimzbbapfrdotjsfyxa.supabase.co`

| 方法 | 路徑 | 次數 |
| --- | --- | ---: |
| POST | `/functions/v1/matrix-status`，四彩各一次 | 4 |
| POST | `/rest/v1/rpc/matrix_explore_list`，四彩各一次 | 4 |

Supabase HTTP 探測使用前端公開 key、不帶會員 access token。Tongxing／number-reference 相容 API 可讀；目前前端這兩項主要從 history 資料在瀏覽器計算，不能僅靠相容 API 200 證明其所有前端操作皆已測完。
