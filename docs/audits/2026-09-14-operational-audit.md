# 2026-09-14 正式系統 31 項稽核與修正

基準 main：`28fbac6e1d1340f9e47f4ffcdcb446e8e0bb8c18`。本報告與修正一起提交；提交後的部署 SHA、服務狀態及正式網域比對結果，另在本次交付訊息記錄。局部測試、正式唯讀查核及真機驗收分開判定，不將其中一項代替另一項。

## 本次實際修正

1. 收回八張後台專用表的瀏覽器角色權限，補兩張 private 表的 RLS，為單列 security identity 表補 Primary Key。沒有讀取、更換或輪替該 secret。
2. 修正首次安裝取得 Service Worker 控制後，同一頁面再收到新版時不會提示更新的問題。
3. 日期與順球完整但尚未取得落球時，保留初步開獎結果；開獎通知嘗試提前至歷史修補、牌單繪製及演算法之前。
4. 落球演算法完成後才能產生／公開落球牌單及觸發對應通知；Python API、牌單服務與正式 DB 發布函式均加上防護。天天樂不進入落球流程。
5. 演算法讀取歷史時合併內容相同的八／九碼期號別名；保留既有目標期號識別，遇到內容衝突即停止，不擅自選取資料。既存已完成演算法沒有強制重算。
6. 天衡跨批次重用完整歷史雙鎖索引；歷史更新會失效，排序分開，每批成功／失敗都清理中間暫存。
7. 清除 Matrix 筆記本「紀錄」殘留頁面、路由、死碼、専用輸入處理及無使用者的 CSS。沒有新增 CSS 覆蓋、`!important` 或內嵌定位。

## 逐項結論

「已修正／驗證」的範圍以證據欄為準；需要真機、實際登入或正式推播收件的項目仍保留驗收缺口。

| # | 項目 | 判定與證據 |
|---|---|---|
| 1 | 全部 SECURITY DEFINER | 完成 176 個函式盤點、31 個瀏覽器可呼叫 RPC 的授權及負向測試。保留的 5 anon／31 authenticated 警示是經逐項審核的 guarded API，沒有為消除警示而全部開放或全部撤銷。詳見安全報告。 |
| 2 | RLS 無 Policy | 逐表盤點；48 項為 service／受控 RPC 路徑，刻意封閉。收回八張後台專用表殘留 grants。52 張應用表全部開啟 RLS。 |
| 3 | Auth 外洩密碼保護 | **未確認**。現有 Supabase connector 沒有 Auth 設定讀寫能力；沒有警示不能證明已開啟。需要可讀取此設定的管理介面／Management API。 |
| 4 | 缺少 Primary Key | **已修正並正式套用**：`private.security_identity_secret` 增加受 true check 約束的 singleton PK；正式查核缺 PK 表數為 0、原表仍為 1 列。 |
| 5 | Cloudflare Pages 正式前台版本 | 本機 PWA 建置成功。稽核初始 main 的不可變 preview 與正式自訂網域 JS 名稱不同，不能僅憑 check 成功宣稱同版；本次提交後須再核對新的部署及正式載入資源，結果見交付訊息。 |
| 6 | 正式管理者前端版本 | 基準 main 本機 admin build 與正式 `/admin/` 完全相同的 JS/CSS 檔名：`index-CKrkLxS_.js`／`index-DJH8IbE4.css`。本次 admin 未改動，重新建置仍相同；部署後再核對。 |
| 7 | Android／Chrome／Edge 安裝 | **待真機驗收**。未把桌面瀏覽器或模擬事件當成實機安裝通過。 |
| 8 | 完整 PWA 更新 | 修正首次 claim 後遺漏後續更新提示；skipWaiting、claim、cache 世代、build hash、提示及 reload 有指定回歸測試。實際已安裝裝置跨版本更新仍待驗收。 |
| 9 | Offline | 已驗證 worker 快取命中不需網路、fallback 與恢復邏輯。沒有實際斷網控制能力，尚未完成安裝裝置斷網／恢復端到端。 |
| 10 | LINE Login 返回 PWA | 已檢查回傳／popup／fallback 的相關 8 組測試；**未完成原生 LINE 授權及 Android 前景返回**。現行 popup 策略與舊 UX-CONTRACT 描述有落差，未擅改登入策略。 |
| 11 | 四彩種 latest API | 四彩種正式 RPC、實際 PWA 最新卡及本機 route 合約均對上期號、日期與號碼。直接開啟 Railway JSON URL 被 client 阻擋，未宣稱已逐一擷取直接 HTTP response。 |
| 12 | 四彩種 cards API | 正式四份 manifest 期號相符、無 last_error；四張 PWA PNG 均成功解碼為 2276×3438。已關閉 legacy raw SVG 越過 readiness／天天樂 raw 的漏洞；未逐張下載比對正式 PNG SHA。 |
| 13 | 開獎資料正確性 | 最新 539／大樂透完整欄位與來源吻合，天天樂期號／號碼及時區換日吻合。六合彩最新落球的官方原始回應未取得；歷史存在缺日期、缺落球及一組日期衝突，詳見下方，**不是全歷史驗證通過**。 |
| 14 | 正式來源二階段更新 | 修正缺落球時丟棄有效順球資料的 parser；SQL 驗證初步期號、正式校正、保留 identity、碰撞 rollback、重試；沒有向正式環境注入測試開獎。 |
| 15 | 重複寫入防護 | 四彩種 SQL 再寫相同資料皆不產生實體 UPDATE；正式 `(lottery, period)` 無重複。保留必要輪詢及中繼資料更新。 |
| 16 | 演算法重複計算 | 完成鍵、owned lease、checkpoint、修正失效及重播有局部驗證；修正 sorted 歷史別名重複輸入。沒有正式全量重跑，也沒有驗算既存全部結果。 |
| 17 | 牌單重複生成 | per-order digest、publication lease、重試及 stale snapshot fence 有直接測試；落球補齊只新增需要的 order。沒有重製正式牌單作為測試。 |
| 18 | 通知重複發送 | event_key 與 lottery/date 雙層防重，正式重複數均 0；失敗保留可重試。**未發送測試通知或驗證裝置收件**。 |
| 19 | 立即開獎通知 | **已修正**主 worker 與天天樂 analysis worker 順序：存入後立即嘗試結果通知，再進入歷史／牌單工作。測試覆蓋後續失敗仍先嘗試通知；正式送達延遲未量測。 |
| 20 | 補落球後全流程 | **已修正**：raw 分析完成 → raw 牌單發布 → 通知；DB migration 已套用，三張現有 raw manifest 均有對應 completed run。沒有人工觸發正式重算或推播。 |
| 21 | 天天樂特殊流程 | source／worker／API／DB 卡發布均為 sorted-only；未等待落球、未執行落球演算法／生成牌單。16 筆舊歷史 nonnull raw 不影響目前禁用規則，未刪改歷史。 |
| 22 | 探索全流程 | 正式 PWA 訪客實際完成查詢、回傳 4 筆並展開一筆 validation；RPC／DB 路徑、版本與最新 manifest/列數對帳通過。 |
| 23 | 天衡全流程 | 來源／RPC／DB、checkpoint、結果對帳通過，並修正重複建立歷史索引。正式訪客按查詢後導向登入；沒有登入身分成功返回結果的端到端證據。 |
| 24 | 天衍全流程 | 現行共享候選 → artifact → guarded RPC 路徑及指定測試通過，正式最新 artifact 存在；尚未完成登入瀏覽器完整查詢／validation。 |
| 25 | 天工 API／演算法 | 真正 calculator 已驗證 50／80、動態間距、驗證鏈及 ID/evidence 對應。現行契約只支援二段式，UI 固定 50、没有拖牌，與清單有規格衝突。沒有任意 top-N 截斷；單一 JSONB／全量回傳的極端結果量風險尚未關閉。 |
| 26 | Matrix 狀態時機 | pipeline 在探索、天衡、天衍、天工之後才完成 status；正式 21 個 active slots 均完整具備 5 artifacts。owned completion SQL fence 及中斷測試通過；未重跑正式全流程。 |
| 27 | 會員權限矩陣 | 正式 SQL 的六狀態 × 免費開關雙值，加訪客共 13 情境通過。未冒用／建立真實會員逐方案登入；詳見會員報告的權限表。 |
| 28 | 免費總開關 | 正式 PWA → RPC、後台與文案來源一致；revision 25 的免費／購買顯示均 true，兩者是獨立開關。旧 TS backend 存在未確認部署的 resolver 殘留，未將它當正式授權路徑修改。 |
| 29 | 後台訂閱資料鏈 | 正式 11 名會員／3 筆 confirmed payment 對帳，累積 36,480，無孤兒關聯／缺 paidAt。UI mapping／storage 復原測試通過；没有執行實際續訂、付款或改到期日。 |
| 30 | 移除功能殘留 | **已修正**筆記本紀錄可達路由及死碼；API／DB 已退役部分確認。保留通知歷史、舊 win 欄位清洗及本機筆記相容讀取，不刪使用者資料。 |
| 31 | 天天樂八處落球禁用 | 八處元件與舊快取／查詢正規化測試通過；正式 PWA 首頁及牌單亦觀察為 disabled。其他頁面尚未逐台真機操作。 |

## 正式資料與不能自動結案的事項

- **歷史六合彩**：6,066 列中 1,480 缺日期、1,383 缺落球；其中部分早期 raw 缺值落在明訂算法邊界之前，不能用順球代填。`093053`／`093054` 均記錄 1993-07-13，但號碼不同，需歷史來源才能判定哪一筆錯誤。
- **期號別名**：539 的 1,045 組與大樂透的 418 組同日期，是完整內容相同的八／九碼期號別名；保留資料，演算法讀取正規化。不是把所有同日資料當成重複而刪除。
- **天工規格**：08-31 維護契約移除一段式，09-08 UX 契約固定 50 UI。恢復一段式、80 UI、拖牌／合值語義需要新的明確規則；本次沒有依舊規格改寫數學。
- **真機與權限設定**：Android 安裝、實際 worker 跨版、實際離線恢復、LINE 原生返回、推播送達及 Supabase Auth leaked-password 設定缺少可操作／可讀取的環境證據，不能寫成完成。

## 驗證與發佈範圍

所有測試命令均指定檔案／測試名稱；沒有執行全專案測試。各報告列出完整命令及各自的覆蓋範圍，測試集合部分重疊，不能相加當成獨立總數。

- 開獎修正最終 17 指定 Python 檔案：252 passed；兩個指定 PostgreSQL/PGlite 檔案：19 passed。
- 天衡與天工最終指定回歸：9 passed；另有探索／天衍及 TS API 的指定合約測試。
- 協調者在來源凍結後，合併上述天衡／天工選擇及 `test_draw_pipeline_ordering.py` 再驗證：32 passed，exit 0。
- PWA 相關指定測試：112 passed；協調者對 PWA、筆記本移除、天天樂排序再跑 4 檔：28 passed，指定 worker／SQL 合約：16 passed。
- TypeScript `--noEmit` 通過；正式 PWA 與 admin Vite build 均成功。大 bundle 警告不是失敗，本次沒有改變拆包或引入樣式覆蓋。
- 獨立審查未找到本次凍結差異新增的重大問題。保留已證實存在於基準的天衡未過期 fixture cleanup 失敗、舊 UI 斷言及 design audit 測試替身告警；沒有為取得全綠修改無關測試。

已套用 migration：

- `20260914141705_database_security_boundaries.sql`
- `20260914143243_raw_card_requires_completed_analysis.sql`

raw 卡 migration 前後均為 27,896 開獎列、124 通知事件、4 筆 publication，最近更新時間與 manifest digest 不變；沒有人工重算／送通知／修補正式歷史資料。

發佈只使用新查得的完整 GitHub main tree 作為 base，替換明確變更檔案，保留全部未修改 blob／二進位資產；更新 main 採 non-force fast-forward。Cloudflare PWA/admin 與 Railway API、crawler、fantasy5-analysis 為受影響部署；其他 Railway project 的 staged changes 不在範圍內。使用 `[skip actions]` 避免違反此專案禁止全量測試的規則，並查核個別正式部署結果。

## 詳細報告

- [資料庫安全](2026-09-14-database-security.md)
- [PWA 生命週期與真機缺口](2026-09-14-pwa-lifecycle.md)
- [開獎、牌單及通知](2026-09-14-draw-pipeline.md)
- [探索、天衡、天衍及天工](2026-09-14-algorithm-flows.md)
- [會員權限及介面](2026-09-14-member-ui.md)
