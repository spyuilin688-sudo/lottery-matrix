# Matrix 探索／天衍共用計算架構 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 將 Matrix Explore 的加減／合值／拖牌、鎖1／鎖2與 Tianyan 共用同一套十三期完整範圍歷史準備與候選規則資料，保留各自正式成立判定，並讓前端與狀態只讀取已保存結果。

**Architecture:** Explore work unit 從「號碼順序×版路×13來源×球位」縮成「號碼順序×13來源×球位」。每個 work unit 一次準備 A/B/C/D/E…、完整範圍座標、拖牌候選與加減／合值候選；Explore 由這份資料做鎖1／鎖2判定，並把 Tianyan 所需的單條候選規則覆蓋資料一併寫入 chunk。Tianyan phase 僅配對與執行複合規則，不重新掃歷史或依賴 Explore 最終鎖1結果。

**Tech Stack:** Python 3.12、pytest、Supabase PostgreSQL/RPC、GitHub Actions。

**Spec:** `docs/superpowers/specs/2026-08-31-shared-explore-tianyan-pipeline-design.md`

## Global Constraints

- 自動計算只執行本日、十三期、完整範圍。
- 二期／七期／十三期只用 `lockedSourceIndex` 篩選，不得各自重跑。
- 標準範圍只從完整範圍結果篩選，不另跑。
- 天天樂只執行「依號碼由小到大排序」。
- 今彩539、六合彩、大樂透可執行順球與落球；落球資料不完整不得用順球代替。
- 拖牌只使用鎖定條件本身；加減、合值排除鎖定條件本身。
- Explore 的鎖1／鎖2正式規則不得改變。
- Tianyan 固定2條規則、最多30個歷史驗證組、雙 miss 立即停止、兩條各自達 `ceil(N×30%)` 獨立命中；同驗證球位＋同演算法不得成立。
- 不新增 Supabase 正式資料表。
- 新版 analysis version 與 v7 完全隔離。
- 本次不改任何 UI。

---

### Task 1: 縮減 Explore work units

**Files:**
- Modify: `services/matrix-api/app/services/explore_batches.py`
- Test: `services/matrix-api/tests/test_explore_batches.py`

**Interfaces:**
- Consumes: `work_units(lottery, history_length, position_count)`
- Produces: 每個 unit 只含 `lottery`, `numberOrder`, `lockedSourceIndex`, `lockedPosition`, `exploreDateOffset`, `exploreRange`, `predictionDistance`，不再包含 `algorithmType`。

- [ ] **Step 1: 先新增失敗測試**

```python
def test_work_units_do_not_multiply_by_algorithm_type() -> None:
    units = work_units("今彩539", 13, 5)
    assert len(units) == 2 * 13 * 5
    assert all("algorithmType" not in unit for unit in units)


def test_fantasy5_only_uses_sorted_order() -> None:
    units = work_units("天天樂", 13, 5)
    assert len(units) == 13 * 5
    assert {unit["numberOrder"] for unit in units} == {"依號碼由小到大排序"}
```

- [ ] **Step 2: 執行測試並確認 RED**

Run: `cd services/matrix-api && pytest -q tests/test_explore_batches.py`

Expected: work unit 數量仍乘上3種 algorithm type，且天天樂仍包含落球，因此 FAIL。

- [ ] **Step 3: 最小修改 work_units**

將外層 `algorithm_type` 迴圈移除；number order 依彩種建立：天天樂只有順球，其餘三彩保留順球／落球。

- [ ] **Step 4: 執行測試確認 GREEN**

Run: `cd services/matrix-api && pytest -q tests/test_explore_batches.py`

- [ ] **Step 5: Commit**

```bash
git add services/matrix-api/app/services/explore_batches.py services/matrix-api/tests/test_explore_batches.py
git commit -m "perf: collapse Explore work units"
```

---

### Task 2: 建立共用候選規則引擎

**Files:**
- Create: `services/matrix-api/app/domain/explore_shared.py`
- Modify: `services/matrix-api/app/domain/explore.py`
- Test: `services/matrix-api/tests/test_explore_shared.py`
- Test: `services/matrix-api/tests/test_explore.py`

**Interfaces:**
- Produces: `prepare_shared_explore_unit(value: dict, newest_first: list[dict]) -> dict`
- Return shape:

```python
{
    "source": {...},
    "lockedNumber": int,
    "predictionDistance": int,
    "coordinates": [
        {
            "referenceOffset": int,
            "referencePosition": int,
            "algorithmTypes": ["加減", "合值"] | ["拖牌"],
            "groups": [...],
            "aBaseByAlgorithm": {"加減": int, "合值": int} | {"拖牌": int},
        }
    ],
}
```

- Produces: `run_matrix_shared_explore_group_with_history(value, newest_first) -> {"results": [...], "tianyanSources": [...]}`

- [ ] **Step 1: 新增共享候選失敗測試**

測試同一個非鎖定座標的每個歷史 group 只走訪一次預測期號碼，但同時產出加減與合值 candidate map；鎖定條件本身只產出拖牌。

```python
def test_shared_coordinate_builds_add_and_sum_together(sample_history):
    prepared = prepare_shared_explore_unit(sample_unit(), sample_history)
    non_drag = next(c for c in prepared["coordinates"] if c["algorithmTypes"] == ["加減", "合值"])
    keys = set(non_drag["groups"][0]["candidateMap"])
    assert any(key.startswith("加減:") for key in keys)
    assert any(key.startswith("合值:") for key in keys)


def test_locked_coordinate_is_drag_only(sample_history):
    prepared = prepare_shared_explore_unit(sample_unit(), sample_history)
    drag = next(c for c in prepared["coordinates"] if c["algorithmTypes"] == ["拖牌"])
    assert all(key.startswith("拖牌:") for key in drag["groups"][0]["candidateMap"])
```

- [ ] **Step 2: 執行測試確認 RED**

Run: `cd services/matrix-api && pytest -q tests/test_explore_shared.py`

Expected: module/function 尚不存在。

- [ ] **Step 3: 實作共用歷史準備與 candidate map**

重用 `explore.py` 現有正式公式：`_candidate_rule`, `_apply_rule`, `_typed_key`, `_highest_rule_sets`, `_validation`。不得更改公式與成立門檻。每個歷史來源 B/C/D…只建立一次 source/reference/prediction 結構；非鎖定座標在同一個 group 建立加減與合值 typed candidates。

- [ ] **Step 4: 讓 Explore 鎖1／鎖2從共享 groups 分流**

對每個 algorithm type 建立 filtered group view，只保留該 algorithm 的 typed keys，再呼叫既有 `_highest_rule_sets` 與正式有效性判定；同一份共享 groups 同時跑 ruleCount 1/2，不重建歷史。

- [ ] **Step 5: 產生 Tianyan 單條候選來源**

每個固定 `referenceOffset + referencePosition + algorithmType + ruleValue` 建立一筆 source，保存：
- 共用搜尋欄位（來源、鎖定號碼、球位、預測期距離、號碼順序）
- `rule` 完整身份
- A 組 base/prediction
- 最多30組歷史 hit coverage 與 prediction period

不得先要求該規則成為 Explore 鎖1有效結果。

- [ ] **Step 6: 回歸既有 Explore 規則測試**

Run: `cd services/matrix-api && pytest -q tests/test_explore.py tests/test_explore_shared.py tests/test_matrix_algorithm_acceptance_v1.py`

Expected: 全部 PASS，既有 Explore 預測與連準判定不變。

- [ ] **Step 7: Commit**

```bash
git add services/matrix-api/app/domain/explore.py services/matrix-api/app/domain/explore_shared.py services/matrix-api/tests/test_explore.py services/matrix-api/tests/test_explore_shared.py
git commit -m "perf: share Explore candidate preparation"
```

---

### Task 3: Explore chunk 同時保存 Tianyan 候選來源

**Files:**
- Modify: `services/matrix-api/app/services/explore_batches.py`
- Modify: `services/matrix-api/app/services/artifact_builders.py`
- Modify: `services/matrix-api/app/repositories/artifact_chunks.py`
- Test: `services/matrix-api/tests/test_artifact_builders.py`
- Test: `services/matrix-api/tests/test_artifact_chunks.py`

**Interfaces:**
- Explore artifact 增加內部欄位：`tianyanSources: list[dict]`。
- `matrix_explore_results` 仍只保存正式 Explore item/validation，不新增欄位。

- [ ] **Step 1: 新增 chunk round-trip 失敗測試**

```python
def test_materialize_explore_chunks_merges_tianyan_sources():
    # 兩個 chunk 各自帶 tianyanSources，materialize 後必須完整合併且不遺失 items/validationById。
    ...
```

- [ ] **Step 2: 執行測試確認 RED**

Run: `cd services/matrix-api && pytest -q tests/test_artifact_chunks.py tests/test_artifact_builders.py`

- [ ] **Step 3: 擴充 artifact chunk materialization**

`decode_chunk_payload` 仍要求 `items` 與 `validationById`；若存在 `tianyanSources` 必須為 list。`materialize_chunks` 合併 `tianyanSources` 並回傳；其他 artifact 不存在該欄位時行為不變。

- [ ] **Step 4: build_explore_batch 改用共享 runner**

每個 work unit 只呼叫一次 `run_matrix_shared_explore_group_with_history`；將 `response["results"]` append 至正式 Explore artifact，並把 `response["tianyanSources"]` append 至 artifact 內部欄位。

- [ ] **Step 5: 執行測試確認 GREEN**

Run: `cd services/matrix-api && pytest -q tests/test_explore_batches.py tests/test_artifact_chunks.py tests/test_artifact_builders.py`

- [ ] **Step 6: Commit**

```bash
git add services/matrix-api/app/services/explore_batches.py services/matrix-api/app/services/artifact_builders.py services/matrix-api/app/repositories/artifact_chunks.py services/matrix-api/tests/test_artifact_builders.py services/matrix-api/tests/test_artifact_chunks.py
git commit -m "feat: persist Tianyan candidate sources with Explore chunks"
```

---

### Task 4: Tianyan 改吃共同候選，不再依賴 Explore 鎖1結果

**Files:**
- Modify: `services/matrix-api/app/domain/tianyan_artifact.py`
- Test: `services/matrix-api/tests/test_tianyan.py`
- Test: `services/matrix-api/tests/test_tianyan_artifact.py`

**Interfaces:**
- `build_tianyan_artifact(lottery, draw_period, explore_artifact)` 改從 `explore_artifact["tianyanSources"]` 讀取候選來源。
- `evaluate_tianyan_candidate` 正式 30 組／30%／same-position+same-algorithm 判定維持不變。

- [ ] **Step 1: 新增關鍵失敗測試**

建立一條未出現在 `explore_artifact["items"]` 的候選規則，但存在 `tianyanSources`，並與另一規則共同符合複合版路；斷言 Tianyan 必須輸出結果。這證明 Tianyan 不再以 Explore `ruleCount == 1` 最終結果為唯一來源。

- [ ] **Step 2: 執行測試確認 RED**

Run: `cd services/matrix-api && pytest -q tests/test_tianyan.py tests/test_tianyan_artifact.py`

- [ ] **Step 3: 修改 Tianyan source extraction**

移除 `_source_rules()` 對 `artifact["items"]` 與 `ruleCount == 1` 的依賴，改讀 `tianyanSources`。配對前仍用 `_same_search` 隔離彩種／順序／來源／鎖定／預測期距離；同驗證球位＋同演算法由 `evaluate_tianyan_candidate` 排除。

- [ ] **Step 4: 保留完整 validation**

輸出仍保存兩條 rule、N、minimumIndependentHits、rule1Only、rule2Only、bothHit、historicalValidation。

- [ ] **Step 5: 執行測試確認 GREEN**

Run: `cd services/matrix-api && pytest -q tests/test_tianyan.py tests/test_tianyan_artifact.py`

- [ ] **Step 6: Commit**

```bash
git add services/matrix-api/app/domain/tianyan_artifact.py services/matrix-api/tests/test_tianyan.py services/matrix-api/tests/test_tianyan_artifact.py
git commit -m "fix: derive Tianyan from shared candidates"
```

---

### Task 5: Analysis pipeline 與版本切換

**Files:**
- Modify: `services/matrix-api/app/worker.py`
- Modify: `services/matrix-api/app/services/analysis_pipeline.py`
- Test: `services/matrix-api/tests/test_analysis_pipeline.py`
- Test: `services/matrix-api/tests/test_analysis_version_progress.py`
- Create: `supabase/migrations/20260831125000_matrix_shared_pipeline_v8.sql`
- Modify/Test: 對應現有 Supabase RPC contract 測試檔（以 repository 目前實際檔名為準，先定位後修改）

**Interfaces:**
- `ANALYSIS_VERSION = "matrix-python-v8"`。
- `matrix_explore_list` 與 `matrix_explore_validation` 只讀取 `draw_period || ':matrix-python-v8'`。
- Supabase schema 不新增 table/column。

- [ ] **Step 1: 新增版本失敗測試**

斷言 worker 版本為 v8；RPC migration 不再引用 `matrix-python-v7`。

- [ ] **Step 2: 執行測試確認 RED**

Run: `cd services/matrix-api && pytest -q tests/test_analysis_pipeline.py tests/test_analysis_version_progress.py`

- [ ] **Step 3: 切換 Worker 版本**

將新共同流程固定為 `matrix-python-v8`；v7 completed run 不得被 v8 視為完成。

- [ ] **Step 4: 新增 Supabase migration**

只更新兩個 RPC 的正式版本選擇／驗證為 v8；保留現有：
- `locked_source_index < v_periods`
- 標準範圍 `reference_offset >= -7`
- sameCode、predictionNumber、streak、roadTypes 篩選
- entitlement 檢查

- [ ] **Step 5: 執行 Python 與 Supabase contract 測試**

Run: `cd services/matrix-api && pytest -q`

Run: repository 現有 Supabase SQL/contract test command（先讀 CI workflow，照專案既有命令執行）。

- [ ] **Step 6: Commit**

```bash
git add services/matrix-api/app/worker.py services/matrix-api/app/services/analysis_pipeline.py services/matrix-api/tests supabase/migrations supabase/tests
git commit -m "feat: cut Matrix analysis over to v8"
```

---

### Task 6: 回歸、效能結構驗收與 PR

**Files:**
- Test: `services/matrix-api/tests/test_explore_batches.py`
- Test: `services/matrix-api/tests/test_explore_shared.py`
- Test: `services/matrix-api/tests/test_tianyan_artifact.py`
- Modify docs only if test evidence requires recording exact counts.

**Interfaces:**
- 今彩539共用 Explore work units = `2 × 13 × 5 = 130`，不再是390。
- 天天樂 = `1 × 13 × 5 = 65`。
-六合彩／大樂透 = `2 × 13 × 7 = 182` 各自。

- [ ] **Step 1: 加入結構效能測試**

斷言 work unit 數量與 algorithm type 無關；共享 runner 一個 unit 僅被呼叫一次，Explore 結果仍可包含加減／合值／拖牌。

- [ ] **Step 2: 完整測試**

Run: `cd services/matrix-api && pytest -q`

Run: repository root 既有 CI test/build command。

Expected: 0 failures。

- [ ] **Step 3: 檢查 diff**

確認：
- 無 UI 檔案變更。
- 無新 Supabase table。
- 無 v7/v8 正式查詢混用。
- Tianyan 不再從 Explore `ruleCount == 1` 最終結果取唯一候選。
- Explore 結果與 validation 仍可由既有 RPC 讀取。

- [ ] **Step 4: 建立 PR**

PR 說明需列出：工作單位縮減、共享 candidate preparation、Tianyan source 改造、v8 cutover、完整測試結果與未量測的實際 wall-clock 效能（不得捏造百分比）。

- [ ] **Step 5: 等待 CI 全綠後才提出合併**
