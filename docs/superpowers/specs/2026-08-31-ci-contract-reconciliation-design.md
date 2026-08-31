# CI 契約收斂修正設計

## 目標

讓 GitHub `test-and-build` 重新通過，保留已上線的 Matrix Python v7、目前手機版 UI 與正式安全距離，不復原已淘汰的 AppDeploy／v5 架構或舊版 CSS 數值。

## 事實基準

- `npm run test:unit`：102 個測試檔、689 項全數通過。
- `npm run build`：通過，Sites client/server 產物完整。
- Node 契約測試：446 項中 63 項失敗；其中 9 項引用已刪除的舊後端模組或 v5，54 項是與較新正式 UI 契約矛盾的來源字串斷言。
- Runtime 的底部導覽高度由 `src/design-tokens.css` 定義為 `72px`；`DESIGN.md` frontmatter 的 `82px` 是鏡像漂移。

## 修正原則

1. 已刪除的 AppDeploy progress reader、cron worker、partition loader 與 matrix-tools 不恢復；Node 測試改讀 Railway Python v7／Supabase v7 的現行契約，或移除已無對應產品邊界的測試。
2. 首頁、底部導覽、原生 guide scroll、Matrix title controls、狀態設定入口與天工 two-stage 行為，以目前 runtime owner、較新 regression test、Vitest 與 `UX-CONTRACT.md` 為準。
3. 通知 v2 維持單一正式 stylesheet owner：push status 規則移入 `feature-page-adjustments.css`，從 responsive legacy owner 移除，渲染數值不變。
4. 號碼對照的整列與單格標記互相覆蓋；選取單格時清除同一期整列標記，對稱於選取整列時清除該期單格標記。
5. 不改首頁版面、功能流程、字級或已核准的手機間距；只修正可證明的產品缺口、測試契約與設計文件鏡像。
6. Matrix Guide 只描述現行契約：探索日期使用本日（最新），天工固定二段式與準2進3，同星不再宣稱顯示已移除的近10期卡片；刪除昨日／前日、一段式與準3進4等已淘汰資訊。
7. Railway 同星替代測試必須以至少兩組結果驗證舊到新排列，確實保護正式 `groups.reverse()` 語意。

## 驗證

- 聚焦 Node 測試先紅後綠。
- 完整 `node --test tests/*.test.mjs`。
- 完整 Vitest、Matrix API pytest、runtime integrity、build 與 DESIGN lint。
- 檢查通知 v2 只有一個 stylesheet owner，並執行 Premium UI 嚴格稽核。
