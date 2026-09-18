# 2026-09-14 Matrix 演算法流程稽核（22–26）

基準：`spyuilin688-sudo/lottery-matrix` 的 main `28fbac6e1d1340f9e47f4ffcdcb446e8e0bb8c18`。本報告區分程式追蹤、有限合成資料驗證及正式資料庫唯讀證據；未重新執行正式完整歷史演算法，未部署、提交、推送或修改正式資料。

## 22. Matrix 探索：前端 → RPC → 資料庫 → 結果

- 前端入口：`src/features/MatrixExplorePage.tsx`，探索分支呼叫 `fetchExploreList`／`fetchExploreValidation`。
- 傳输層：`src/matrix-algorithm-api.ts` 的 `cachedMatrixResultRpc` 直接呼叫 Supabase `matrix_explore_list(jsonb)`／`matrix_explore_validation(jsonb)`；快取依會員作用域、權限 revision、條件區分，回傳前重新驗證 session/data revision。這條正式讀取路徑不是舊 `backend` HTTP route。
- 正式 RPC：唯讀查詢 `pg_proc` 已確認 list/validation 均存在；list 公開 wrapper 轉入 `private.matrix_request_guard`，再至 `private.matrix_explore_list_impl`。目前實作依日期、排序取得 active analysis version，再讀 `matrix_explore_results`；驗證依同一期、版本及 item ID 讀取。
- 生產者：`ExploreEngineSession`／`run_explore_batch` → `AnalysisPipeline` 分批保存 chunks 及正規化結果 → 完成 artifact manifest。歷史索引與來源十三期為不同概念，完整歷史不截為八十期。
- 正式最新 sorted manifest 數量與正規化結果數量完全相等，見下表。此證據確認儲存一致性，不替代登入瀏覽器實際請求與逐條數學驗算。

## 23. Matrix 天衡：雙鎖定流程

- 同一 `MatrixExplorePage` 的天衡分支呼叫 `fetchTianhengList`／`fetchTianhengValidation`；RPC `matrix_tianheng_list`／`matrix_tianheng_validation` 均存在。列表與驗證讀同一期 active version 的獨立 `matrix_tianheng_results`。
- `TianhengContext` 對每期全部正式球位建立有序雙鎖定組合；五球為十組，七球為二十一組，歷史必須同時符合兩個位置與號碼。同期期數的參照排除兩個鎖定位置；拖牌使用靠前鎖定條件。標準／完整範圍與運算共用探索核心。
- 依 2026-09-10 已確認天衡規格，來源計算十三期；前端三期／十三期篩選既存結果；同一任務的 `tianheng` 階段在探索之後、天衍之前，分批 checkpoint 與中斷重播有直接測試。
- **已修正：** `create_artifact_builders` 原先每一個天衡 batch 都重新建立完整歷史雙鎖定索引。現在按彩種與號碼排序保留同一 verified Explore session 對應的 Tianheng session；歷史修正造成 Explore session 更新時，天衡索引同步替換，排序互不混用。
- 記憶體生命週期維持批次界線：每批成功或失敗都透過 `finally` 清除天衡的 range/candidate/drag 暫存，只保留歷史索引。避免因重用 session 而累積十三期所有中間矩陣。
- 新測試先重現重建缺陷（2 fail／1 pass），再驗證重用、歷史更正、排序隔離、成功／失敗暫存釋放；另以有結果的五中一失敗合成資料比較重用與全新 session 的完整 artifact／validation 相等。

## 24. Matrix 天衍：共享候選到複合结果

- 前端同頁天衍分支 → `fetchTianyanList`／`fetchTianyanValidation` → `matrix_tianyan_list`／`matrix_tianyan_validation` → request guard → private implementation → 完成版本的 Tianyan artifact；公開 RPC 均經正式 `pg_proc` 確認。
- 現行探索引擎先產生共享的 `tianyanItems`／`tianyanValidationById`；`build_tianyan_artifact` 優先使用這些內容，並檢查彩種／期號。只從探索最終結果重新組合的是舊相容分支，不能當作目前正式來源。
- `tianyan_shared.py` 依相同鎖定搜尋條件分組，使用歷史 hit masks 尋找最高連準組合；現行門檻為四至三十組，每條規則至少涵蓋 `ceil(streak × 0.3)` 組，並限制合併結果號碼數。未根據較舊、互相衝突的記憶修改數值規則。
- 既有直接相關測試涵蓋共享候選不依賴探索最終列、相同鎖定條件、最高連準、合併超過兩碼排除、四中與三十中顯示，以及 validation 分離。

## 25. Matrix 天工：支援範圍、規格差異與結果量

真正生產路徑是 `artifact_builders.tiangong` → `build_tiangong_artifact` → `tiangong_algorithm.calculate_tiangong`，不是舊 `tiangong_generator.py`。正式最新 sorted artifacts 的版本均為 `tiangong-two-stage-near-2-to-3-v2.1.0-sorted`。

| 檢查點 | 現況與結論 |
| --- | --- |
| 50期／已移除80期 | 使用者確認80期早已移除；前端固定 `periodRange: 50` 為正確現況。初次稽核找到生產者仍先算80再篩50的殘留，後續修正為直接計算50。通用 calculator、舊 RPC／資料讀取仍保留80相容能力；正式排程不再要求80期運算，亦不恢復80 UI。 |
| 已移除一段／正式二段 | 現行 parser、前端及現行測試只接受二段式、準2進3。使用者已確認一段式早已移除，不屬未完成或待恢復項目。 |
| 動態間距 | source spacing、第一段距離、第二段距離分別依可行位置列舉；沒有 12 期上限。50／80 的 source spacing 列舉上界分別 24／39，無法容納中間已開獎期的組合會自然淘汰。 |
| 球位 | 固定／依序遞增／依序遞減；不可循環；正碼由小到大，七球彩種特別號保持最後。預測另驗證排序球位可行範圍。 |
| 加減／合值／拖牌 | 現行核心為循環加減及直接 `合值 − 基礎號碼`；合值超界不回捲。`+0` 現行保留為加減，沒有拖牌 route；不是十進位各位數相加。這與 08-21 舊文件的 +0 拖牌分類、合值循環規則有明確差異，未自行改寫。 |
| 驗證 | C/B/A 第一段均須命中，C/B 第二段命中，A 第二段是下一期預測；同完整規則若可延伸至 D 且兩段都中，排除隱藏準3進4。缺 D 歷史不可假設失敗；正式50期來源範圍仍需74期歷史完成 D 排除，不可把歷史截為50列。 |
| 去重與結果上限 | 使用包含期號、各段間距、方向、球位、運算、預測的完整 identity SHA-256 去重；沒有任意 top-N 截斷。 |
| 防爆量 | 先建立目標球位數列形狀索引，反推相容規則後才組合；D 排除、排序球位檢查及完整去重已實作。仍一次持有全部 results/evidence，artifact 為單一 JSONB，天工 RPC 回傳全部符合列後前端分頁，沒有計算 checkpoint 或後端分頁。不能宣稱任意歷史／極端合成輸入均不會爆量。 |

新增 `test_tiangong_production_search.py` 直接執行正式 calculator，以固定 seed 的119期合成資料、固定球位測試50／80來源範圍。證明50結果ID集合完全等於80結果中符合50者、三種間距均可超過12、遍歷的 source/stage pairs 數符合完整可行組合數、全部輸出有对应 evidence、第一／二段驗證角色與D排除正確。此為有限本機合成計算，不是正式完整演算法重跑或所有球位模式的壓力測試。

後續依使用者更正，以 main `da675985b4bac2aa6847a54267c0ffc9649c4e05` 核對最新來源後，將 `build_tiangong_artifact` 的來源範圍改為50及結果 eligibility 改為50。新增四彩種生產請求與74期歷史邊界回歸，修正前5項失敗；另將有限合成對照擴充至四彩種，直接比較結果全部欄位（排除退役範圍標記）及完整 evidence。測試中的80期僅作舊生產者回歸對照，不是恢復產品功能。既存已完成 artifacts 與 analysis version 保持相容，沒有強制重算或改寫開獎資料。

後續最終驗證：`python -m pytest -q tests/test_tiangong_artifact.py tests/test_tiangong_production_search.py`，15 passed，exit 0。這是指定檔案與有限合成回歸，不代表正式完整歷史結果已重新運算。

## 26. Matrix 狀態與完成時機

- `AnalysisPipeline.PHASES` 固定為 explore → tianheng → tianyan → tiangong → status。任何前置階段未完成 checkpoint 或拋錯，都不能進入狀態完成發布。
- 狀態的實際數學來源依天衡規格保持 explore／tianyan；`status.artifactKinds` 只有這兩項代表計算來源，不代表整個 run 只要求兩項。
- 正式 `matrix_analysis_complete_owned` 先檢查 lease owner／有效期、draw 資格，鎖定 run/artifact，要求五項 artifact 都存在，才一起標記 complete 並更新 active version。正式唯讀查詢確認目前21個保留 active slots 全為 complete、missing kinds 空陣列。
- 不應要求 draw-order run 重算排序天工：天工是排序專用，draw-order 階段按現行設計寫空占位 artifact；對外天工讀 sorted active version。
- 失敗重播、天衡未完不前進、天工先於 status、完成前 artifact 檢查均有直接相關測試。正式全量計算完成時序未重新演練。

## 正式資料唯讀快照

2026-09-14 約14:10–14:18 UTC，project `wcimzbbapfrdotjsfyxa`，依每彩種最新 sorted active version：

| 彩種 | 期號 | 探索 manifest／正規化列 | 天衡 manifest／正規化列 | 天衍列 | 天工列 | 天工 JSONB `pg_column_size` |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| 今彩539 | 115000223 | 2646／2646 | 1499／1499 | 32 | 4513 | 2,219,472 bytes |
| 天天樂 | 11999 | 2635／2635 | 1720／1720 | 34 | 4846 | 2,382,934 bytes |
| 六合彩 | 026099 | 8269／8269 | 7511／7511 | 44 | 10101 | 5,363,726 bytes |
| 大樂透 | 115000087 | 8243／8243 | 5841／5841 | 41 | 10634 | 5,652,483 bytes |

這是資料庫儲存大小，並非 HTTP 傳輸大小。檢查全部天衍／天工 item 對 validationById 的額外 aggregate 遇 MCP HTTP504，未重試；不宣稱正式每筆驗證資料已逐一校驗。公開 RPC guard 會更新請求計數，本次只查 schema／資料，未以正式會員登入、未冒用會員、未觸發寫入型請求。

## 驗證結果與限制

- 新增／直接影響的最終指定測試：`test_tianheng_builder_cache.py`、`test_tianheng_pipeline.py::test_tianheng_builder_reuses_explore_session_and_preserves_checkpoint`、`test_tianheng_pipeline.py::test_pipeline_checkpoints_and_resumes_tianheng_without_rerunning_explore`、`test_tiangong_production_search.py`：**9 passed**。
- 探索／天衡／pipeline 指定檔案檢查曾得到27 passed；其他明確列出的探索核心、天衍、天工既有測試共65 passed。這些都是局部檢查，未執行全專案測試。
- TypeScript 明確五檔 `src/matrix-algorithm-api.test.ts`、`src/matrix-algorithm-api.tianheng.test.ts`、`src/matrix-api-client.test.ts`、`backend/matrix-tianyan-routes.test.ts`、`backend/matrix-tiangong-routes.test.ts`：**60 passed**。其中 backend route 測試不表示正式前端使用該舊 HTTP 路徑。
- 天衡整個 pipeline 測試檔另有基準失敗：`test_expired_unretained_tianheng_results_are_cleaned_up` 對尚未過期 fixture 傳入未來日期，與目前 cleanup 把 cutoff 限於實際現在的規則衝突（預期1，實得0）；相關 repository／原測試均無本次修改，單独重現仍失敗。依範圍要求未更改既有 retention 規則或測試來取得全綠。
- 本次未重跑正式演算法、未驗證真實會員權限 HTTP 全流程、未做極端結果量壓測；拖牌語義仍待核對。一段式與80期是已移除項目，不再列為待恢復或未完成。
