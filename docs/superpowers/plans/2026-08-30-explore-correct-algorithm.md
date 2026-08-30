# Matrix Explore Correct Algorithm Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 以使用者上傳規格取代現行 Explore 的全期距、全域候選兩兩枚舉及錯誤連準上限，並移除重複的 TypeScript 舊探索演算法。

**Architecture:** Railway Python 是唯一正式 Explore 計算來源。每個工作單元固定探索日期、來源期、球位、版路與預測期距；歷史組每組只產生5值，鎖1從B/C交集延伸，鎖2只從B/C最多10值形成候選並逐組淘汰。Supabase artifact欄位格式維持不變。

**Tech Stack:** Python 3.12、pytest、TypeScript、Vitest、Git。

**Spec:** `docs/specs/matrix-explore-correct-algorithm-2026-08-30.md`

## Global Constraints

- 不修改天衍與天工演算法。
- 加減與合值排除鎖定條件本身；拖牌只使用鎖定條件本身。
- 鎖1連準達8整條無效；鎖2連準達12整條無效。
- 不補寫附件「原文未完整定義」的規則。
- 不讀取或續用 `matrix-python-v4` 的舊計算結果。

---

### Task 1: 固定來源與預測期距

**Files:**
- Modify: `services/matrix-api/tests/test_matrix_algorithm_acceptance_v1.py`
- Modify: `services/matrix-api/tests/test_explore_batches.py`
- Modify: `services/matrix-api/app/domain/explore.py`
- Modify: `services/matrix-api/app/services/explore_batches.py`

**Interfaces:**
- Consumes: `explorePeriods`, `exploreDateOffset`, `lockedSourceIndex`。
- Produces: 每個 work unit 的 `predictionDistance` 與 `exploreDateOffset`。

- [ ] **Step 1: 寫入來源位置固定預測期的失敗測試**

```python
assert [(item["number"], item["predictionDistance"]) for item in result["results"]] == [
    ("01", 1), ("02", 1), ("03", 1), ("04", 1), ("05", 1),
    ("06", 2), ("07", 2), ("08", 2), ("09", 2), ("10", 2),
]
```

- [ ] **Step 2: 執行測試並確認舊程式因每個來源掃多個期距而失敗**

Run: `uv run pytest -q tests/test_matrix_algorithm_acceptance_v1.py -k 'prediction_distance or lock_condition'`

- [ ] **Step 3: 修改 automatic Explore 與 batch work units**

```python
for relative_source_index, source in enumerate(sources):
    prediction_distance = relative_source_index + 1
```

工作單元必須包含固定 `exploreDateOffset`、`lockedSourceIndex`、`predictionDistance`，不得再包含1至13的期距範圍。

- [ ] **Step 4: 執行來源、批次與artifact測試**

Run: `uv run pytest -q tests/test_matrix_algorithm_acceptance_v1.py tests/test_explore_batches.py tests/test_artifact_builders.py`

### Task 2: 正確驗證座標

**Files:**
- Modify: `services/matrix-api/tests/test_matrix_algorithm_acceptance_v1.py`
- Modify: `services/matrix-api/app/domain/explore.py`

**Interfaces:**
- Produces: `_reference_coordinates(algorithm_type, locked_position, position_count, reference_back, prediction_distance)`。

- [ ] **Step 1: 寫入74、79座標及鎖定格排除測試**

```python
assert len(_reference_coordinates("加減", 1, 5, 14, 1)) == 74
assert len(_reference_coordinates("合值", 1, 5, 14, 2)) == 79
assert (0, 1) not in _reference_coordinates("加減", 1, 5, 14, 1)
assert _reference_coordinates("拖牌", 1, 5, 14, 2) == [(0, 1)]
```

- [ ] **Step 2: 執行測試並確認合值仍包含鎖定格而失敗**

Run: `uv run pytest -q tests/test_matrix_algorithm_acceptance_v1.py -k reference_coordinates`

- [ ] **Step 3: 所有 Explore 入口共用座標函式**

移除加減 `+0` 自動改成拖牌的舊分支；版路型別只由使用者選擇的驗證範圍決定。

- [ ] **Step 4: 執行 Explore 測試**

Run: `uv run pytest -q tests/test_explore.py tests/test_matrix_algorithm_acceptance_v1.py`

### Task 3: 逐組候選池與連準上下限

**Files:**
- Modify: `services/matrix-api/tests/test_explore.py`
- Modify: `services/matrix-api/tests/test_matrix_algorithm_acceptance_v1.py`
- Modify: `services/matrix-api/app/domain/explore.py`

**Interfaces:**
- Produces: `_highest_rule_sets(groups, rule_count)`，候選來源只允許B/C。

- [ ] **Step 1: 寫入B/C候選池、D停止、三值無效及上下限失敗測試**

```python
groups = [
    {"candidateMap": {"加減:1": [1], "加減:2": [2]}},
    {"candidateMap": {"加減:1": [1], "加減:3": [3]}},
    {"candidateMap": {"加減:1": [1], "加減:2": [2], "加減:3": [3]}},
    {"candidateMap": {"加減:1": [1], "加減:2": [2]}},
    {"candidateMap": {"加減:1": [1], "加減:2": [2], "加減:3": [3]}},
]
assert _highest_rule_sets(groups, 2)["invalidMultipleRules"] is True
```

- [ ] **Step 2: 執行測試，確認全歷史聯集、命中數先篩選及13期上限使測試失敗**

Run: `uv run pytest -q tests/test_explore.py tests/test_matrix_algorithm_acceptance_v1.py -k 'candidate_pool or streak_limit or three'`

- [ ] **Step 3: 實作鎖1與鎖2的分離搜尋**

鎖1只檢查 `B ∩ C`；鎖2只從 `B ∪ C` 形成最多45個二值候選，先覆蓋B/C，再依D、E逐組淘汰。禁止把D以後的新值加入候選。

- [ ] **Step 4: 在結果建立前套用上下限**

```python
minimum = 4 if rule_count == 1 else 5
invalid_at = 8 if rule_count == 1 else 12
```

達到 `invalid_at` 必須回傳無效，不能選擇較短候選。

- [ ] **Step 5: 每個鎖1值建立獨立結果；鎖2同號只保留一個預測號碼**

不得把多條鎖1規則的預測號碼先聯集成同一筆結果。

- [ ] **Step 6: 執行所有 Explore 測試**

Run: `uv run pytest -q tests/test_explore.py tests/test_matrix_algorithm_acceptance_v1.py tests/test_explore_batches.py tests/test_artifact_builders.py`

### Task 4: 淘汰重複 TypeScript Explore 演算法

**Files:**
- Create: `backend/matrix-algorithm-shared.ts`
- Modify: `backend/matrix-explore-service.ts`
- Modify: `backend/matrix-tianyan-partitions.ts`
- Modify: `backend/matrix-tianyan-partitions.test.ts`
- Modify imports in `backend/matrix-custom-status-routes.ts`, `backend/matrix-tianyan.ts`, `backend/matrix-tianyan-service.ts`, `backend/matrix-tiangong.ts`, `backend/matrix-tiangong-generator.ts`, `backend/matrix-tiangong-service.ts` and their type-only tests
- Delete: `backend/matrix-algorithm.ts`
- Delete: `backend/matrix-algorithm.test.ts`
- Delete: `backend/matrix-algorithm-cases.ts`
- Delete: `backend/matrix-algorithm-cases.test.ts`

**Interfaces:**
- Produces: `MatrixLottery`、`MatrixNumberOrder`、`MatrixAlgorithmType`、`MatrixDraw`、`MatrixExploreGroupInput`、`normalizeMatrixNumber` 共用定義。

- [ ] **Step 1: 新增共用型別測試所需的新 work unit 欄位**

```ts
export type MatrixExploreGroupInput = {
  lottery: MatrixLottery;
  numberOrder: MatrixNumberOrder;
  algorithmType: MatrixAlgorithmType;
  lockedSourceIndex: number;
  lockedPosition: number;
  exploreDateOffset: 0 | 1 | 2;
  predictionDistance: number;
  exploreRange: '完整範圍';
};
```

- [ ] **Step 2: 更新所有共用引用並刪除舊可執行 Explore 程式與案例**

保留天衍、天工所需的型別及 `normalizeMatrixNumber`，不修改其演算法。

- [ ] **Step 3: 執行 TypeScript 測試與型別檢查**

Run: `npm test -- --run`

Run: `npm run build`

### Task 5: 新分析版本與完整驗證

**Files:**
- Modify: `services/matrix-api/app/worker.py`
- Modify all tests expecting `matrix-python-v4`

**Interfaces:**
- Produces: `matrix-python-v5`。

- [ ] **Step 1: 寫入v5版本期望並確認測試失敗**

Run: `uv run pytest -q tests/test_worker.py tests/test_scheduled_worker_resume.py tests/test_analysis_version_progress.py`

- [ ] **Step 2: 將 `ANALYSIS_VERSION` 更新為 `matrix-python-v5`**

舊v4 chunks不得被v5續算或讀作同一批結果。

- [ ] **Step 3: 執行完整Python與前端測試**

Run: `uv run pytest -q`

Run: `npm test -- --run`

- [ ] **Step 4: 執行正式今彩539工作量檢查**

確認每個work unit只有一個 `predictionDistance`，每個加減／合值座標排除鎖定格，鎖2候選最多來自B/C的10值。

- [ ] **Step 5: 檢查Git差異並提交獨立分支**

```bash
git diff --check
git status --short
git commit -m "fix: replace explore algorithm with confirmed specification"
```
