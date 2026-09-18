# 首頁 Core 與四大功能驗證

範圍：2026-09-12 使用者選定的黑金插畫參考。只更新 MatrixCoreBanner、HomeShortcutRow、兩個既有 CSS 擁有者及專用素材。

- 基底：GitHub main 16ce29adb1d7521be65dcbcadea2d88759cb1d08；相較開工時 a1c9e8f，僅營運 runbook 變更，已保留。
- 四卡順序與路由：Matrix 同星 → tongxing、號碼對照單 → reference、Matrix 牌單 → matrix-card、Matrix 指南 → guide。
- Matrix Core 維持 explore；底部／快捷計算機維持 calculator。
- 六份 WebP 約 974 KB；插畫保留原比例，金框以九宮格切片呈現。

## 已完成

- `npx vitest run src/__tests__/HomePremiumEntrances.test.tsx src/__tests__/homepage-layout-request.test.ts`：8/8。
- `node --test tests/matrix-core-frame-fit.test.mjs tests/homepage-feature-visible-gap.test.mjs tests/homepage-card-fit.test.mjs tests/homepage-core-symbol-frame-polish.test.mjs tests/homepage-visual-language.test.mjs tests/homepage-layout-request.test.mjs tests/homepage-approved-optimization.test.mjs tests/homepage-independent-insets-and-guide-scroll.test.mjs`：26/26。
- `npm run build:pages`：runtime 27 個受保護檔案、TypeScript、前台及後台 Vite、PWA 版本標記通過。本機僅補入預覽需要的既有圖片，完整素材由 Cloudflare 從 GitHub 取用。
- 獨立程式審查未發現阻擋問題；新元件測試獨立重跑通過，`git diff --check` 通過。
- 舊動態 M／八節點測試隨退役效果移除。既有兩份 CSS fixture 的 Logo 對齊斷言過時：以未修改 main CSS 重現為 flex-start，僅同步測試預期，沒有修改 Logo。
- 僅執行上述明確路徑；沒有執行全量測試，commit 使用 `[skip actions]`。

## 正式畫面驗證完成

Cloudflare `95ae3b4` 與 `70c921c` 均回報成功部署，正式站 https://matrixlottery.idv.tw/ 已載入新版。控制台安全驗證及未啟動的分支預覽沒有視為成功證據，最終檢查直接使用正式頁面。

| 瀏覽器視窗寬度 | 功能列寬度 | 單卡尺寸 | 四卡標籤與圖片 |
|---|---|---|---|
| 320px | 288px | 65 × 90px | 單行、完整載入 |
| 390px | 358px | 82.5 × 103.92px | 單行、完整載入 |
| 430px | 358px | 82.5 × 103.92px | 單行、完整載入 |

- 三種尺寸皆無水平溢出。320px 原先繼承較寬的 Inter，已改用載入中的 Roboto；沒有縮小字級或卡片。實測三個 Matrix 名稱寬度 51.375px、小於 55px 可用寬度，行高 13px。
- Core 金屬框、標題及 M 完整呈現；390px Core 為 358 × 99.08px。四張插畫保持完整比例。
- 鍵盤 Tab 可從 Core 到第一張卡，focus-visible 為 2px 金色實線；原生捲動可看到完整聲明，聲明底部 768.52px、導覽起點 778px。
- 正式頁面實際開啟：MATRIX 探索、MATRIX 同星、號碼對照單、MATRIX 牌單、MATRIX 指南；底部計算機仍開啟連碰計算機。
- `public/home-style-review.html` 已在驗證後移除，沒有新增產品導覽入口。
- Roboto 修正後重新執行上述兩份 Vitest（8/8）與功能卡間距檢查（1/1）；Cloudflare 再次完整建置成功。

![正式首頁 Core 與四大功能](home-core-four-functions-390.jpg)
