# 會員卡 A+B 修改與驗證

僅調整「我的」頁的會員資料卡、目前訂閱狀態卡與對應樣式、素材及測試。沿用已確認 A+B 參考，會員 API、LINE 登入／登出、訂閱計算、付款與其餘頁面保持原流程。

## 整合基準

本次在獨立副本整合至 GitHub main `3a38735ff5805d318524d43b04803ee76d9cad35`。來源與測試檔以 Git blob hash 核對；提交使用該 main 的完整 tree，只加入明確列出的會員卡變更，不提交舊副本其他工作的差異。原工作目錄與其驗收素材保留。

## 樣式與資料

`src/feature-pages.css` 是兩張卡片的特定樣式唯一來源，移除舊重複規則與 `feature-page-adjustments.css` 的分隔線覆寫。兩張 PNG 裝飾位於 `public/assets/lottery/membership/`，框線用 border-image 隨內容高度適配。

LINE 頭像、暱稱、方案、到期日與剩餘天數仍使用既有資料。皇冠對輔助科技隱藏，既有 M 維持低透明度水印。兩個動作至少 44px 高，頁面留白 16px、區段間距 8px。窄版文字換行與既有長暱稱省略策略保持可用。

## 本次重新驗證

- 132 項 Vitest：會員頁、相關版面、訂閱方案、正式入口與 LINE auth 測試通過。
- 31 項 Node 檢查：會員卡、既有 UI、Premium contract、方案卡 19px 與付款區 16px owner 通過。
- `npm run build:pages` 通過，包含 TypeScript 與 27 個受保護 runtime 檔案完整性檢查。
- 新副本瀏覽器：390px 兩卡為 358×100／358×179；320px 為 288×100／288×195，兩種寬度皆無水平溢出、日期可讀。
- 390px 登出與訂閱入口皆 44px 高；會員頁圖片正常載入。
- 320px 長暱稱未造成水平溢出；訂閱入口開啟原 ProPlansPage，返回後恢復 ProfilePage，未提交付款。
- 全 src Premium strict audit 發現一個原有測試替身按鈕（`src/__tests__/TianyanExpandedLayoutPatch.test.tsx:124`）沒有 handler；該檔與 main 相同，不在本次修改範圍。此次會員卡 production code 未被標記。
- 本機副本未下載全部不相關歷史文件與素材；本機建置不作為部署封包。完整 repository 的 CI 結果以 PR 檢查為準。
- 實際 LINE 身分提供者、真實付款與實體手機 PWA 往返未執行。

## 預覽與原驗收素材

執行 `node_modules/.bin/vite build --config tests/membership-preview/vite.config.mjs`，以原專案 dev server 開啟 `/qa/?width=390`。QA 匯入實際 ProfilePage、ProPlansPage、AppDialogProvider 與正式樣式，只替換外部服務；正式入口不匯入 QA。

可切換 320／360／390／430px 與既有年費、長暱稱、未登入、免費、終身、讀取失敗及登出失敗情境。測試資料不代表真實帳號。

`compare.html`、`reference-ab.png`、`mobile-390.jpg`、`comparison-final.jpg` 保留原工作已完成的視覺比較。此次重新驗證的兩張卡幾何與原驗收一致，沒有重新設計或新增圖片。

Superdesign 先前的第三方分析傳輸曾被自動審查阻擋；本次直接接續已確認的參考與既有素材，沒有重新登入或重試該傳輸。
