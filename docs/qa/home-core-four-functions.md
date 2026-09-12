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

## 合併前

Cloudflare 分支預覽確認 320、390、430px 排版、完整插畫、鍵盤焦點與五個入口，再移除暫時的 `public/home-style-review.html`。尚未將視覺檢查標示為完成。
