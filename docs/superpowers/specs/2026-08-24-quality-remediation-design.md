# 樂彩 Matrix 既有問題修正設計

日期：2026-08-24  
Repository：`spyuilin688-sudo/lottery-matrix`  
Branch：`main`  
基準 HEAD：`90597286b96ee7f9484ccb2a0aa7a13c37210cac`

## 1. 目的

處理目前正式 `main` 的既有測試落差與 Frontend Design Premium 稽核問題，不回復舊版 UI，不重新設計頁面，也不改動 Matrix 演算法、資料流程或未提及的功能。

## 2. 判定基準

- 正式來源為最新 `main` 與其較晚提交所確認的行為。
- 測試若仍鎖定已被較晚提交取代的結構、尺寸或檔案路徑，更新測試，不把舊規則複製回 production。
- README 已明定 `src/` 為 Vite 正式來源；`app/` 是相容／示例來源，不納入正式 PWA 稽核。
- 現有響應式版面與視覺維持不變；修正只處理契約、互動、可及性與瀏覽器相容性。

## 3. 現況

### 3.1 Vitest

目前精準重跑為 12 tests、4 pass、8 fail。八項失敗均屬測試落後於最新來源：

- 六項首頁樣式測試只讀 `src/homepage-repair.css`，但正式規則已拆至該入口匯入的 canonical CSS。
- Matrix Core 測試仍要求舊的 child image 與舊比例；最新來源已改為 container background 與現行尺寸 token。
- Matrix 天衍測試仍要求隱藏近 10 期；較晚提交 `16ea751` 已明確加入天衍近 10 期，並新增相反契約測試。

### 3.2 Node tests

目前 `node --test tests/*.test.mjs` 為 222 tests、152 pass、70 fail。失敗來源：

- 舊測試不解析 CSS `@import`，只讀入口檔文字。
- 測試鎖定已被較晚提交取代的 px、selector 或 markup。
- 測試仍讀取已刪除的 `project-overrides.css/js`。
- 同星測試仍引用已由正式 API 取代的 `buildTongXingPairs`。
- Matrix Explore 測試依賴已移除的註解 marker。
- `mobile-runtime-frame.test.mjs` 含無效 regex literal。
- `rendered-html.test.mjs` 依賴未受版控的 build artifact，且 fixture 對 `/index.html` 固定回 404。
- 部分測試彼此要求不同時期的互斥尺寸。

### 3.3 Frontend Design Premium

strict、no-write 稽核目前為 33 errors：

- 4 項原生 Date／Select ownership 未宣告。
- 18 項來自非正式、legacy 或不可達程式。
- 3 項為 JSX spread、Radix `asChild` 或 pointer handler 未被分析器辨識。
- 8 項為正式來源中的實際問題。

## 4. 測試修正方式

### 4.1 CSS 測試

建立共用測試 helper，從指定入口遞迴解析本地 CSS `@import`，再對合併後的正式來源做 assertion。不得把 canonical 規則複製回入口檔。

### 4.2 最新正式契約

- Matrix 天衍保留目前近 10 期卡片及其展開行為。
- Matrix Core 保留目前 container background 實作與現行尺寸 token。
- 首頁、底部導覽及功能頁尺寸以最新 `main` 的 production source 為準。
- 已刪除的 override layer 不重新建立。
- 同星測試改驗證目前正式 API contract，不恢復已移除的本機計算 export。

### 4.3 失效 fixture

- 修正無效 regex literal。
- 移除對註解 marker 的依賴，改驗證可執行的 source contract。
- rendered HTML 測試先產生受控 build artifact，ASSETS fixture 必須實際供應 `/index.html`。

### 4.4 互斥舊契約

對同一元件存在互斥期待時，保留最新 production source 對應的測試；被較晚提交明確取代的 assertion 直接更新，不以 production 覆寫同時滿足互斥規格。

## 5. Premium 正式化

### 5.1 稽核邊界

新增專案 Premium 設定與 UX contract：

- profile 使用產品／管理介面模式。
- production source root 僅包含 `src/`。
- canonical UI map 記錄在 `UX-CONTRACT.md`。
- Date 與 Select/Listbox 採 OS 原生控制，維持目前手機 PWA 的操作方式。
- false positive 以稽核支援的證據或例外機制記錄，不為通過稽核加入虛假 `onClick`。

### 5.2 正式來源修正

以下項目維持目前版面，只補齊既有文字已承諾的行為：

- Matrix 牌單「下載 PNG」：下載目前牌單，不新增其他匯出格式。
- 「邀請好友」：導向既有 `invite-friends` 頁面。
- 管理員登入：改為 app-owned validation，顯示 email／password 錯誤並補齊 `aria-invalid`、`aria-describedby`。
- 筆記 textarea：取消使用者任意 resize，維持目前既有高度與版面。
- carousel scrollbar：提供 Firefox 與 WebKit 都可使用的 scrollbar，不以隱藏 native scrollbar 取代操作。
- 會員「登出」：由 LINE 登入規格所定義的 Supabase session owner 處理。

### 5.3 缺少 API 的按鈕

「輸入推薦碼／確認」目前沒有 mutation API。不得建立未定義的 referral API；正式按鈕先呈現不可提交狀態，直到另有推薦碼 API 規格。

## 6. 不在本次範圍

- 首頁或功能頁重新設計。
- 修改現有字級、卡片比例、排列或響應式規則。
- 修改 Matrix Explore、天衍、天工或狀態演算法。
- 新增推薦碼寫入 API。
- 修改 `app/` 相容／示例頁面以配合正式 PWA 稽核。
- 新增未提及的按鈕、頁面或操作流程。

## 7. 驗收

- 八項既有 Vitest 失敗改為驗證最新正式來源並全部通過。
- `node --test tests/*.test.mjs` 不再依賴舊 override、失效 marker、無效 regex 或缺少的 artifact，且整套測試通過。
- 互斥的舊尺寸 assertion 已依最新 production contract 收斂。
- Premium strict audit 在 production source root 下沒有 unresolved ownership 或正式產品 violation。
- 不以假 handler、空連結或複製舊 CSS 規則換取測試通過。
- TypeScript、Vitest、Node tests 與 production build 通過。
