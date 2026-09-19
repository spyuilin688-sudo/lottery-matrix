# PWA 標題卡背景 QA — 2026-09-19

final result: passed

Baseline: `ec1c25f7d56c8558fc5f8ec5b0536186a26dc091`。
範圍：使用者核准的 31 款背景；卡片大小、金框、Logo 與位置、返回鍵、主標與英文副標位置、頁面內容與功能全部保留。

## 視覺證據與正規化

- Source visual truth path：使用者核准的 31 張 PNG，原始檔位於本次工作區 `generated_images/exec-*.png`；對應成品為 `public/assets/lottery/headers/*.webp`。下列比較圖左側直接載入 PNG 原圖，右側渲染現有 `BrandHeader`。
- 原圖與 WebP 均為 2048 × 768；WebP quality 92，31 檔共 3,038,844 bytes，沒有重繪或裁切原檔。
- Browser viewport：1363 × 936 CSS px；截圖：1363 × 936 px，1:1 顯示。測試畫布分別為 320、390、430px。
- 390px 畫布的卡片外框為 358 × 68px；背景沿用原本 `center / cover`，比較圖以相同內容尺寸裁視原圖。設定卡保留 66px 內框與原本 1px 外框。
- State：31 種標題的既有前景元件、收合設定、原本有／無返回鍵；使用既有所有字型、標題尺寸、英文副標與原版 Logo。
- Full-view comparison evidence / implementation screenshot paths：

| 頁面組 | 原圖與實際卡片並列 |
| --- | --- |
| 天工、我的、天衍、天衡、探索、同星、對照單 | [比較 01](docs/qa/title-backgrounds/header-comparison-01.jpg) |
| 歷史、牌單、指南、狀態、自訂觸發、筆記本、通知 | [比較 02](docs/qa/title-backgrounds/header-comparison-02.jpg) |
| 計算機、訂閱、付款、方案、轉帳、關於 | [比較 03](docs/qa/title-backgrounds/header-comparison-03.jpg) |
| 推薦碼、服務說明、退款、客服、邀請、優惠、版本 | [比較 04](docs/qa/title-backgrounds/header-comparison-04.jpg) |
| 會員條例、隱私、聲明 | [比較 05](docs/qa/title-backgrounds/header-comparison-05.jpg) |

Focused region evidence：上述圖片的比較範圍本身就是完整標題卡，另檢視 [320px 長標題](docs/qa/title-backgrounds/header-background-320.jpg) 與 [93 組固定元素量測](docs/qa/title-backgrounds/geometry.json)。

## 發現與修正歷程

1. 初次比較發現長文字與亮金圖案相交，屬 P2 可讀性問題。
2. 僅於通知、推薦碼、服務說明、客服、版本資訊的背景文字區加入柔和暗化；圖片來源與所有前景元素維持原樣。
3. 重新擷取比較 02／04，檢查 320px 長標題，再次比對全部 93 組元素；無新增位置、尺寸、字型、字色、金框或圓角差異。沒有待修的本次 P0／P1／P2 問題。

## 五項視覺表面

- Fonts / typography：現有字型、字重、字級、行高、字距與前景文字均不變；93 組量測一致。
- Spacing / layout：卡片、金框、Logo、返回鍵、標題、副標與操作欄的相對座標及尺寸完全一致。320px 原有的長英文副標裁視保留，遵守不改文字版位的要求。
- Colors / tokens：保留所有前景與框線 token；只有背景來源與必要背景暗化變化。
- Image quality：31 個主題使用核准圖像，高品質 WebP；五組 PNG 原圖與實際渲染並列確認主題、構圖與清晰度。文字區暗化是為可讀性而採取的背景處理。
- Copy / content：所有文案、Logo、路由、權限、訂閱可見性、頁面內容及事件處理沒有變更；沒有應用程式 TS／TSX 差異。

## 行為與驗證

- Browser：標題卡設定展開／Escape 收合／焦點回到設定按鈕／返回回呼通過。
- 實際本機 App：首頁 → 指南 → 返回 → 我的正常，指南使用 `guide.webp`、我的保留無返回鍵。
- Console：乾淨的 App 頁面檢查僅看到瀏覽器擴充套件 metadata 錯誤，沒有應用錯誤；開發中 QA fixture 的 HMR 重複 createRoot 訊息不屬於交付程式。
- `node --test tests/matrix-explore-header-background-owner.test.mjs`：2 passed；涵蓋所有已知標題、31 個有效 WebP、背景唯一擁有者。
- `npx vitest run src/features/BrandHeader.test.tsx src/__tests__/ToolHeaderSettings.test.tsx`：5 passed。
- `npx tsc --noEmit`：passed。
- `npx vite build`：passed；保留既有 bundle 大小提醒。
- `npm run check:runtime`：27 個受保護檔案通過。
- `npx -y -p @google/design.md designmd lint DESIGN.md`：0 errors / 0 warnings。
- `git diff --check`：passed；CSS AST 比對確認其他樣式宣告完全不變。

## 既有狀況與範圍

修改前已記錄舊 `explore-product-header`／`title-content-gap` 測試的 4 項失敗：仍預期硬編碼尺寸、舊通知名稱或舊樣式。此次保留現行版位，不修改那些測試。原有 planet SVG 測試已由新背景擁有者／素材覆蓋檢查取代。

Premium strict 靜態檢查的 2 項錯誤都來自未修改的測試 mock 按鈕（`AppPermissionSettings.test.tsx`、`permission-settings.test.tsx`）；沒有新增產品流程檢查問題。本次沒有執行全量測試，也沒有更動管理後台或後端。

## 交付檢查

- [x] 31 款背景與三個既有別名均有對應。
- [x] 移除探索頁舊背景覆寫與兩個重複 import。
- [x] 保留九項指定不動的元素與行為。
- [x] 完成圖像、固定版位、操作與限定範圍測試。
