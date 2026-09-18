# Matrix Explore v6 Correct Algorithm Implementation Plan

> **For Codex:** Use `superpowers:executing-plans`, `superpowers:test-driven-development`, and `superpowers:verification-before-completion`.

**Goal:** 依 `docs/specs/matrix-explore-correct-algorithm-2026-08-30.md` 淘汰 Explore v5 錯誤候選組合與重複結果，建立只計算本日的 v6。

**Architecture:** Railway Python Worker 是唯一 Explore 計算來源。鎖2依 B、C、D……逐組演進候選狀態；全部候選停止後才判斷相同最長結果是否超過2個。每條路只存一筆 canonical result；2／7／13期由 `lockedSourceIndex` 篩選。Supabase RPC 讀取可索引的 canonical result，不解析 zlib+base64 chunks。

**Confirmed rules:**

- 加減與拖牌都允許 `+0`；版路類型由驗證範圍決定。
- 拖牌只驗證鎖定條件本身；加減、合值排除鎖定條件本身。
- 鎖1只輸出準4、5、6、7；達8整條無效。
- 鎖2只輸出準5、6、7、9、11；準8、10不輸出；達12整條無效。
- 搜尋途中出現超過2個候選不得提前失效；同一最長連準最終結果超過2個才整條無效。
- 本日完整歷史工作量：2種號碼順序 × 3種版路 × 13來源 × 5球位 = 390 work units。
- 同一條路只儲存一筆；2／7／13期不複製資料。
- v6驗證通過前不刪v5；通過後只刪精確匹配 `draw_period || ':matrix-python-v5'` 的舊結果。

---

### Task 1: 逐組候選狀態與最終失效判定

**Files:**
- Modify: `services/matrix-api/tests/test_matrix_algorithm_acceptance_v1.py`
- Modify: `services/matrix-api/tests/test_explore.py`
- Modify: `services/matrix-api/app/domain/explore.py`

- [ ] 先新增失敗測試：B/C後暫時有3個pair，完整延伸後只剩2個最長結果，必須有效。
- [ ] 先新增失敗測試：完整延伸後仍有3個相同最長pair，必須整條無效。
- [ ] 兩個最終pair即使合計使用3個不同值也仍有效；不得以distinct value數判定。
- [ ] 新增單次值只在中間有效、在頭或尾無效的測試。
- [ ] 新增B/C無共同值時，D命中B值後只保留該B值+C五值的測試；反向同理。
- [ ] 執行測試確認RED。
- [ ] 移除 `itertools.combinations(B ∪ C, 2)`，實作1值／2值逐組狀態。
- [ ] 全部states結束後才找最高streak與最終sets，再判斷 `len(sets) > 2`。
- [ ] 執行完整Explore測試確認GREEN。

Run:

```bash
cd services/matrix-api
uv run pytest -q tests/test_explore.py tests/test_matrix_algorithm_acceptance_v1.py
```

### Task 2: +0、拖牌座標與連準輸出

**Files:**
- Modify: `services/matrix-api/tests/test_matrix_algorithm_acceptance_v1.py`
- Modify: `services/matrix-api/tests/test_explore.py`
- Modify: `services/matrix-api/app/domain/explore.py`

- [ ] 先新增四彩種的加減 `+0` 與拖牌 `+0` 失敗測試。
- [ ] 驗證 `+0` 不改變使用者選擇的版路類型。
- [ ] 驗證拖牌座標固定 `[(0, locked_position)]`；加減／合值排除該座標。
- [ ] 驗證今彩539下1期完整範圍74座標、下2期79座標。
- [ ] 新增鎖1與鎖2允許／禁止streak測試，禁止回退輸出較短streak。
- [ ] 新增兩值與預測號碼由小到大、相同預測號碼去重測試。
- [ ] 執行RED→最小實作→GREEN。

### Task 3: 本日390 work units與canonical artifact

**Files:**
- Modify: `services/matrix-api/app/services/explore_batches.py`
- Modify: `services/matrix-api/app/services/artifact_builders.py`
- Modify: `services/matrix-api/app/domain/tianyan_artifact.py`
- Modify: `services/matrix-api/tests/test_explore_batches.py`
- Modify: `services/matrix-api/tests/test_artifact_builders.py`
- Modify: `services/matrix-api/tests/test_tianyan_artifact.py`
- Modify: `services/matrix-api/tests/test_status_artifact_sources.py`

- [ ] 先把work unit測試改為只允許 `exploreDateOffset=0` 與總數390，確認RED。
- [ ] 先把artifact測試改為同一raw result只存一筆，確認RED。
- [ ] 刪除昨日／前日work unit與 `_explore_selections` 的2／7／13複製。
- [ ] Stored item移除 `explorePeriods`；保留 `lockedSourceIndex` 與 `lockedSourcePeriod`。
- [ ] 天衍只適配canonical row格式，不改演算法。
- [ ] 狀態以13期範圍派生，不再重複計數。
- [ ] 執行artifact、天衍、狀態測試。

### Task 4: Supabase canonical results與v6 RPC

**Files:**
- Modify: `services/matrix-api/app/repositories/analysis_repository.py`
- Modify: `services/matrix-api/app/services/analysis_pipeline.py`
- Modify: `services/matrix-api/tests/test_analysis_repository.py`
- Modify: `services/matrix-api/tests/test_analysis_pipeline.py`
- Create via `supabase migration new`: `supabase/migrations/*_matrix_python_v6_explore_results.sql`
- Create: `services/matrix-api/tests/test_matrix_explore_migration_contract.py`
- Modify: `src/matrix-algorithm-api.ts`
- Modify: `src/matrix-explore-rpc.test.ts`

- [ ] 先列出Supabase project與migration狀態，確認v5 migration是否已套用。
- [ ] 由CLI產生migration檔，不猜timestamp。
- [ ] 建立 `matrix_explore_results`：composite PK、analysis run FK cascade、RLS、service_role grant、list filter index、expiry index。
- [ ] Repository先寫失敗測試：batch upsert idempotent、item與validation同列、空batch不upsert。
- [ ] Pipeline先寫失敗測試：save chunk → save canonical results → update progress；失敗不得前進cursor。
- [ ] RPC只讀v6 canonical rows；不讀 `chunk.payload->'items'`。
- [ ] 2／7／13使用 `locked_source_index < requested_periods`。
- [ ] 同碼使用完整排序後 `prediction_numbers` 陣列相等，不以單一號碼重疊判定。
- [ ] 重複號碼統計最多18張；點擊號碼後只篩選包含該號碼的版路。
- [ ] Validation從同一canonical row讀取，依source index與reference offset套用既有權限。

### Task 5: 探索頁只顯示本日與號碼卡篩選

**Files:**
- Modify: `src/FeaturePages.tsx`
- Modify: `src/__tests__/MatrixExplorePage.test.tsx`
- Modify only if necessary: `src/feature-pages.css`

- [ ] 日期固定顯示「本日 (最新)」，移除昨日／前日互動選項。
- [ ] 所有Explore request固定 `exploreDateOffset: 0`。
- [ ] 號碼卡改為可鍵盤操作的button；點擊傳送 `predictionNumber`，再次點擊取消。
- [ ] 保留現有手機畫面尺寸、深藍／金色視覺與三列排列，不增加新流程。
- [ ] 執行MatrixExplorePage、RPC、premium contract與build。

### Task 6: v6完整驗證、重算與刪除v5

**Files:**
- Modify: `services/matrix-api/app/worker.py`
- Modify all exact v5 version tests.

- [ ] 先更新version測試為 `matrix-python-v6`，確認RED，再修改worker constant。
- [ ] Python完整pytest、Vitest、Node tests、build、`git diff --check`全部通過。
- [ ] 套用migration並執行Supabase security/performance advisors。
- [ ] 推送修正分支，整合main後核對遠端SHA。
- [ ] 觸發最新一期v6；今彩539progress total必須390。
- [ ] 回報canonical總數，以及2／7／13、加減／合值／拖牌、鎖1／鎖2、predictionDistance各筆數。
- [ ] 驗證非本日=0、duplicate id=0、鎖2準8／10／12+=0、鎖1準8+=0。
- [ ] 抽樣驗證加減、合值、拖牌公式與期數。
- [ ] v6全部通過後，先列出v5精確刪除筆數，再刪除v5 runs並確認v5為0、v6仍存在。
