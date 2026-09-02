# 樂彩 Matrix 探索功能三版路演算法 API

## 正式完整修正版規格與可執行核心

- 版本：`matrix-explore-canonical-v1`
- 日期：2026-09-02
- 版路：加減、合值、拖牌
- 命中條件：準4+（鎖定1碼）、準5+（鎖定2碼）
- 實作語言：Python 3.11+
- 執行依賴：純標準函式庫

---

## 1. 本版必須修正的兩個錯誤

### 1.1 不得枚舉 `B ∪ C` 的全部兩兩組合

舊範例先取得 B 與 C 候選聯集，再以雙層迴圈產生所有不同 pair。若聯集有10個值，就先產生45組，之後每個 pair 再往 D、E、F……驗證。這仍屬全 pair 枚舉，不符合「禁止笛卡兒積膨脹」的設計目標。

正式核心禁止：

```python
all_bc_candidates = list(B | C)
for i in range(n):
    for j in range(i + 1, n):
        ...
```

正式核心改為：

```text
B 的候選值建立有限 anchor states
↓
依序讀 C、D、E、F……
↓
每個 anchor 只維護仍活著的 secondCandidates 集合
↓
候選狀態中斷時才記錄該狀態的真正最長連準
```

程式層指標：

```text
globalPairEnumerations = 0
```

### 1.2 不得只保留第一個 `best_pair`

舊範例只在 `streak > best_overall_streak` 時更新，因此後續同高 pair 不會被保存。這會漏掉同一 cell 內的並列最高規則，無法正確執行「最高連準不同規則超過2個時整條無效」。

正式核心必須：

```text
保存所有完成延續後的 pair score
↓
找最高連準 highest
↓
保留所有 streak == highest 的 top pairs
↓
抽出 distinct rules
↓
>2個不同規則 → 整個 cell INVALID
恰好2個不同規則 → 才能輸出準5+
```

---

## 2. 判定單位：每個 cell 完全隔離

加減／合值 cell 的唯一座標至少包含：

```text
彩種
號碼順序
A來源期
鎖定球位
鎖定號碼
預測期距
參考相對期
參考球位
版路類型
```

不同 `referenceOffset` 或不同 `referencePosition` 是不同 cell：

- 分開產生候選。
- 分開跑準4+／準5+。
- 分開判斷並列最高規則。
- 分開輸出。
- 不得跨 cell 合併候選值後再做 `>2` 判定。

拖牌 cell 固定為：

```text
referenceOffset = 0
referencePosition = 鎖定球位
```

---

## 3. 彩種與輸入資料

| 彩種 | 合法號碼 | 位置數 |
|---|---:|---:|
| 今彩539 | 01～39 | 5 |
| 天天樂 | 01～39 | 5 |
|六合彩 | 01～49 | 6個正碼＋特別號，共7 |
| 大樂透 | 01～49 | 6個正碼＋特別號，共7 |

號碼順序：

- `依號碼由小到大排序`
- `依實際開獎順序排序`
- 天天樂只允許由小到大排序。
- 落球資料不完整時拒絕計算，不得以順球資料替代。

歷史資料要求：

- `history` 必須依最新到最舊排列。
- 每期必須有 `period`。
- 每期號碼數量必須符合彩種。
- 號碼必須位於合法範圍。
- 同一期號碼不得重複。
- 至少提供13期。
- 全部輸入歷史都建立索引，不設80期、100期等任意總量上限。

---

## 4. 13個來源期只建立一次

固定建立最近13個來源期：

```text
lockedSourceIndex = 0  → predictionDistance = 1
lockedSourceIndex = 1  → predictionDistance = 2
...
lockedSourceIndex = 12 → predictionDistance = 13
```

二期、七期、十三期只做結果過濾：

```text
二期   → lockedSourceIndex < 2
七期   → lockedSourceIndex < 7
十三期 → lockedSourceIndex < 13
```

不得為2／7／13期重跑演算法，也不得把同一條 canonical result 複製儲存三次。

---

## 5. 歷史 occurrence 索引

索引鍵：

```text
(lottery, numberOrder, position, number)
```

對來源 A：

```text
B = 最近一次相同號碼、相同球位
C = 再前一次
D = 再前一次
E、F……依序往前
```

歷史總量全部可搜尋，但單一路徑只讀到足以確認最大合法連準：

- 準4+：第8個歷史組仍延續即無效。
- 準5+：第12個歷史組仍延續即無效。

這是單一路徑停止邊界，不是歷史資料總量限制。

---

## 6. 預測期距與歷史結果期

A 的預測期距：

```text
predictionDistance = lockedSourceIndex + 1
```

歷史 occurrence 使用相同期距：

```text
resultIndex = occurrence.drawIndex - predictionDistance
```

結果期不存在時，該 occurrence 不得進入驗證。

---

## 7. 加減與合值的驗證範圍

### 7.1 完整範圍

```text
上1～14期：每期全部球位
同期：除鎖定條件本身外的全部球位
下1期～預測期前1期：每期全部球位
```

結果期本身不得進入驗證範圍。

### 7.2 標準範圍

```text
上1～7期
同期合法球位
下1期～預測期前1期
```

### 7.3 只建立一次完整範圍

每個 occurrence 只建立一次完整 cell cache：

```text
上8～14 → FULL_ONLY
其餘合法 cell → STANDARD_AND_FULL
```

標準範圍是完整範圍的 View／Filter，不重新：

- 搜尋 occurrence。
- 建立 range cell。
- 計算加減候選。
- 計算合值候選。
- 對同一 cell 重跑狀態機。

共享 cell 的 canonical result 只保存一次，標記同時適用標準與完整；上8～14的 cell 只適用完整。

---

## 8. 拖牌範圍

拖牌只使用歷史相同鎖定條件本身：

```text
relativeOffset = 0
position = 鎖定球位
base = 該 occurrence 的鎖定號碼
```

拖牌：

- 不建立完整 range cells。
- 不讀上1～14。
- 不讀同期其他位置。
- 不讀下方其他位置。
- 只判定一次。
- 結果同時適用標準與完整查詢。
- 不重算、不重複儲存。

---

## 9. 三種版路公式

### 9.1 加減

```text
value = (target - base + maximum) mod maximum
```

- 39碼彩種：`+0～+38`
- 49碼彩種：`+0～+48`
- `+0` 可以用於加減版路。

套用 A：

```text
prediction = wrap1(A_base + value, maximum)
```

### 9.2 合值

```text
value = base + target
```

保留完整合值，不縮成模數。

套用 A：

```text
prediction = wrap1(value - A_base, maximum)
```

### 9.3 拖牌

```text
value = (target - lockedNumber + maximum) mod maximum
```

- `+0` 可以用於拖牌。
- 版路類型取決於驗證 cell，不得用 `+0` 判斷版路類型。

### 9.4 候選去重

同一 cell、同一歷史組中，相同規則值只保存一次。若同一規則值對應多個中獎號碼，保存：

```text
ruleValue → hitNumbers集合
```

不得展開成多條重複規則。

---

## 10. 準4+：鎖定1碼

```text
B candidates ∩ C candidates
↓
空集合 → STOP
↓
對每個共同值依序驗證 D、E、F……
↓
取得每個值真正最長連準
```

有效層級：

```text
準4進5
準5進6
準6進7
準7進8
```

邊界：

- 連準達8次：整個 cell 無效。
- 不得刪除最早組後偽裝成準7進8。
- 準4+是鎖定1碼，因此最高連準規則必須恰好1條。
- 同一 cell 有2條或以上同高最高規則時，不得拆成多筆結果。

---

## 11. 準5+：鎖定2碼

### 11.1 基本條件

- 必須恰好2條不同規則。
- 兩條規則的聯集必須覆蓋從 B 開始的連續歷史組。
- 同一歷史組同時命中2值，連準仍只增加1次。
- 兩規則套用 A 後可以得到同一正式號碼；邏輯仍為準5+，顯示時去重成1碼。

### 11.2 正確的增量狀態機

每個有效 pair 至少有一條規則覆蓋 B，所以只以 B 的候選值建立 anchor states：

```text
anchorRule
secondCandidates
firstHasMissed
```

處理 C、D、E、F……時：

#### anchorRule 命中

- 當 anchor 尚未漏掉任何組時，新的第二候選可在目前或後續任一組首次出現。
- 既有 secondCandidates 保留。
- 不建立全域 pair 清單。

#### anchorRule 未命中

- secondCandidates 必須命中該組才能存活。
- 第一次 anchor miss 時，可由該組候選建立 secondCandidates，因為更早的組都已由 anchor 覆蓋。
- 後續每次 anchor miss，只能對 secondCandidates 做交集縮減，不能任意加入無法覆蓋先前 miss 的新值。
- 所有 secondCandidates 都消失時，該 anchor state 停止。

### 11.3 B、C沒有共同值

準5+不立即停止：

```text
B建立anchor states
C成為secondCandidates
↓
繼續比對D
```

D 若不含 anchor，也不含任何仍活著的 second candidate，該 state 才停止。

### 11.4 第二規則可在 F 或更後面出現

合法例：

```text
B：+10
C：+10
D：+10
E：+10
F：+10、+24
G：+10
```

- 第一規則：`+10`
- 第二規則：`+24`
- 第二規則到 F 才首次出現。
- F 同時存在第一與第二規則仍然有效。
- 不能因 D、E 尚未出現第二值而停止。

### 11.5 不只保存第一個最高 pair

每個 candidate state 中斷時記錄：

```text
canonicalPair = (min(rule1, rule2), max(rule1, rule2))
streak = 真正連續覆蓋長度
```

先逐 pair 套用合法層級、12次上限與單次值頭尾限制，形成 `eligiblePairScores`；再計算：

```text
highest = max(eligiblePairScores)
topPairs = 所有 eligible streak == highest 的 pair
```

不得使用單一 `best_pair`。無效 pair 不得截短，但不會抹除其他獨立、合法的 pair。

### 11.6 有效層級

```text
準5進6
準6進7
準7進8
準9進10
準11進12
```

以下不輸出：

```text
準8進9
準10進11
```

### 11.7 最大連準

任一候選 pair 第12次仍延續：

```text
該候選 pair INVALID
```

不得把該 pair 截短成準11進12。其他不同規則組成、且本身最高連準為合法層級的 pair，仍依自己的完整延續結果參與最終最高判定；這不是對同一 pair 截短。

### 11.8 單次值頭尾限制

最高 pair 中任一規則若整段只出現1次：

- 只在第一組：無效。
- 只在最後一組：無效。
- 位於中間：可繼續最終判定。

### 11.9 同一 cell 並列最高規則

對所有符合最高連準且通過單次值限制的 topPairs：

```text
抽出 distinct rules
```

- `>2`：整個 cell 無效。
- 不得挑第一組。
- 不得輸出 N Choose 2。
- 恰好2條不同規則：輸出唯一準5+結果。

---

## 12. 去重與唯一鍵

### 12.1 Pair canonical key

只在狀態實際完成延續時建立：

```text
(min(rule1, rule2), max(rule1, rule2))
```

這不是預先枚舉 B∪C 的全部 pair。

### 12.2 預測號碼去重

兩條不同規則預測同碼：

- 規則仍為2條。
- `predictionNumbers` 只顯示1碼。

### 12.3 結果 ID

唯一鍵至少包含：

```text
彩種、排序、來源期、鎖定球位、鎖定號碼、預測期距、
參考相對期、參考球位、版路、規則數、最高連準、規則值、scopeKey
```

相同 ID 若內容不同，必須報錯，不可靜默覆蓋。

---

## 13. 防爆量硬邊界

1. `globalPairEnumerations` 必須為0。
2. 禁止 `itertools.combinations(B | C, 2)`。
3. 禁止用雙層迴圈先建立全部 pair。
4. anchor state 數量不超過 B 單期候選數：5或7。
5. secondCandidates 使用 Set，隨歷史組增量更新與縮減。
6. 準4+達8次立即判 cell 無效。
7. 準5+達12次立即判 cell 無效。
8. 加減與合值共用完整 range cell cache。
9. 標準範圍只過濾 FULL_ONLY cell。
10. 拖牌不建立 range cell。
11. 中間候選不輸出、不寫入最終結果。
12. 不使用 `LIMIT 60／40／20` 截斷錯誤結果。
13. 歷史索引讀取全部輸入資料，不以80期代替。

---

## 14. 複雜度

設：

- `H`：歷史期數。
- `P`：單期球位數，5或7。
- `S`：13來源期的鎖定條件數。
- `C`：完整範圍 cell 數。
- `G`：單一路徑歷史組上限，最大12。

主要成本：

```text
Occurrence index：O(H × P)
Cell候選：O(S × C × G × P)
準4+：O(G × P)
準5+：O(G × activeAnchorStates × activeSecondCandidates)
```

不存在：

```text
O(Choose(|B∪C|, 2) × G)
```

歷史增加主要影響索引建立；單一路徑因8／12邊界保持有界。

---

## 15. API 契約

### GET `/health`

回應：

```json
{
  "status": "ok",
  "service": "matrix-explore-canonical-api",
  "version": "1.0.0"
}
```

### POST `/v1/explore/calculate`

請求：

```json
{
  "lottery": "今彩539",
  "numberOrder": "依號碼由小到大排序",
  "explorePeriods": 13,
  "exploreRange": "完整範圍",
  "roadTypes": ["加減", "合值", "拖牌"],
  "ruleCounts": [1, 2],
  "selectedStreaks": ["準4進5", "準5進6", "準7進8"],
  "includeValidation": false,
  "history": []
}
```

核心先建立13來源期的 canonical artifact；`explorePeriods`、版路、規則數、連準、範圍只過濾輸出。

回應主要欄位：

```json
{
  "status": "success",
  "data": {
    "analysisVersion": "matrix-explore-canonical-v1",
    "lottery": "今彩539",
    "drawPeriod": "期號",
    "numberOrder": "依號碼由小到大排序",
    "explorePeriods": 13,
    "exploreRange": "完整範圍",
    "results": [],
    "validationById": {},
    "duplicateStats": [],
    "total": 0,
    "metrics": {
      "globalPairEnumerations": 0
    }
  }
}
```

---

## 16. 結果排序

```text
最高連準由高到低
→ 預測期由近到遠
→ 鎖定球位
→ 版路
→ 參考相對期
→ 參考球位
→ ID
```

規則值與預測號碼均由小到大。

---

## 17. 已包含的測試邊界

- 加減 `+0`。
- 拖牌 `+0`。
- 加減循環值。
- 完整合值。
- 準4+ B、C無交集停止。
- 準4+ 4／5／6／7有效。
- 準4+ 8次無效且不截短。
- 準4+ 同高2值無效。
- 準5+ B、C無交集但D形成延續。
- 第二值到F才出現。
- F同時存在第一與第二值。
- 同期兩值只算一次。
- 第二值永不形成。
- 暫時3值不得提前淘汰。
- 完整延續後3個並列最高規則無效。
- 保留全部同高 top pairs，不只第一個。
- 準5+ 5／6／7／9／11有效。
- 準8進9、準10進11不輸出。
- 任一候選 pair 準12進13無效且不截短；其他獨立合法 pair 仍可參與判定。
- 單次值頭／尾無效，中間有效。
- 無全域 pair 枚舉。
- 13來源期一次建立。
- range／candidate cache只建立一次。
- 拖牌不建range cell。
- 落球資料缺失拒絕。
- deterministic ID。
- 標準／完整共享結果不重複儲存。
- 2／7／13期只過濾，不重算。

---

## 18. 正式替換舊演算法的順序

本套件本身不修改現有 GitHub、Supabase 或正式資料。整合時必須依序：

1. 在獨立分支接入新核心。
2. 先跑本套件測試與現有專案 regression。
3. 使用真實歷史資料和人工已知案例逐筆驗收。
4. 新版本寫入新的 analysis version。
5. 前端、Matrix狀態、天衍依賴切換到新版本。
6. 確認新版本完整後，停止舊 runtime 入口。
7. 以 forward migration DROP 舊 runtime function、清除舊結果資料。
8. 最後刪除舊演算法程式與舊專用測試。
9. 已執行 migration 歷史檔保留，不直接刪除。

---

## 19. 驗證狀態

本交付已完成：

- Python編譯檢查。
- 28項單元與整合測試。
- HTTP health端點測試。
- HTTP calculate端點測試。
- 500／1000／3000期合成資料 benchmark。
- 程式碼掃描確認沒有 `itertools.combinations`、`all_bc_candidates`、`best_pair`。

正式取代現有線上版本前，仍必須以實際歷史資料與已知手算案例驗收。此限制不影響本檔作為可執行 API 套件使用，但不得把合成測試描述成真實歷史驗證。
