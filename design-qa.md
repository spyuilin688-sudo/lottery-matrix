# Matrix Explore 下半部 Design QA

## 比對條件

- source visual truth path: `/workspace/scratch/1cca17731fb2/upload/02-1000018328.jpg`
- original implementation evidence: `/workspace/scratch/1cca17731fb2/upload/01-1000018475.jpg`
- browser-rendered implementation screenshot: `/workspace/scratch/qa-matrix-explore-390-final.jpg`
- normalized comparison evidence: `/workspace/scratch/qa-matrix-explore-reference-comparison-final.jpg`
- route/state: 首頁 → Matrix Core → 開始探索；今彩539、同碼開啟、連準篩選預設值、版路明細收合。
- CSS viewport: 390 × 852 px；另實測 375 × 852 px、360 × 852 px。
- source pixels: 1373 × 1536 px，為下半部區域的高密度截圖；依 390px CSS 寬度正規化為 390 × 436 px（約 3.52×）。
- implementation pixels: 390 × 852 px，1×；聚焦比對裁切為 390 × 457 px。

## Findings

- 無剩餘 P0／P1／P2 視覺差異。正規化並排證據中，兩個金色外框面板、標題層級、6 × 3 統計格、聲明文字、結果欄寬、三列高度與分隔線皆保留相同的資訊密度與閱讀順序。
- 字體與排版：沿用產品既有中文字體 fallback 與數字字體；標題、表頭、數字、次要說明的字重與層級對齊參考，390／375／360 均無不當換行或截斷。
- 間距與版面節奏：下半部面板使用一致的 `.75rem` 內距；標題列不換行；結果欄採 1 / 1.08 / 1.23 / 1.46 / 1.46 / 1.46 比例，三個支援寬度均無頁面、面板或資料列水平溢位。
- 色彩與 tokens：移除暫存紅、青、綠、黃、紫、粉 debug 外框；面板、按鈕、文字與分隔線回到既有黑金 token，沒有新增一次性色彩覆寫。
- 影像與圖示：此聚焦區沒有需替換的產品影像；沿用既有 Chevron 元件並將尺寸調整為 8px，以符合參考比例及消除 360px 單像素溢位，未新增手繪 SVG、CSS 圖或替代資產。
- 文案與內容：所有既有資料、號碼、標題、說明與按鈕文字保持不變。
- 可及性與狀態：`同碼` 保留 `aria-pressed`；連準篩選維持具名稱的 modal dialog 與關閉按鈕；版路明細維持 `aria-expanded`。可點擊控制項未互相重疊。

## Comparison History

1. 初始比對
   - P1：`01-1000018475.jpg` 有六組全域彩色 debug 外框，遮蔽正式黑金視覺。
   - P2：連準篩選為灰色預設按鈕，且結果區欄寬、列高與面板內距和參考圖不一致。
   - 修正：從 `src/prototype.css` 刪除整段暫存 debug 規則；在唯一正式來源 `src/matrix-explore-spacing.css` 調整面板內距、金色透明按鈕、欄寬比例、46px 列高與單行聲明。
   - 後測證據：`qa-matrix-explore-reference-comparison-final.jpg` 左側參考、右側實作已無上述 P1／P2 差異。
2. 響應式比對
   - P2：360px 實測時，最後一欄 10px Chevron 因次像素取整造成資料列 1px 水平溢位。
   - 修正：正式來源將 `.road-type-toggle svg` 收斂為 8px，未以 `overflow: hidden` 掩蓋問題。
   - 後測證據：360px 的 body、`.mobile-scroll`、`.result-panel`、三個 `.road-result-row` 與三個 `.road-type-toggle` 溢位值均為 0；390 與 375 亦為 0。

## Full-view / Focused Evidence

- full-view: `qa-matrix-explore-390-final.jpg` 為瀏覽器內 390 × 852 的實際應用 viewport，確認上方歷史表、下方兩個目標面板與固定底部導覽不重疊。
- focused region: `qa-matrix-explore-reference-comparison-final.jpg` 將參考圖正規化後與相同狀態的下半部實作並排；密集表格文字、按鈕、邊框與間距均可直接判讀，因此不需要額外放大裁切。

## Primary Interactions Tested

- Matrix Core 入口與「開始探索」可用，結果區正常產生。
- `同碼`：`aria-pressed` 由 `true` 變 `false`，結果列由 3 列變 6 列，結果數更新為 1080。
- `連準篩選`：dialog 可開啟，4 個 checkbox 正常呈現，關閉按鈕可關閉。
- 版路類型：首列 `aria-expanded` 由 `false` 變 `true`，驗證明細內容正常顯示。
- console errors checked: 應用程式來源錯誤 0；僅觀察到雲端瀏覽器擴充套件自身的 metadata 記錄錯誤，與應用程式無關。

## Implementation Checklist

- [x] 移除暫存 debug 規則，而非以新覆寫遮蓋。
- [x] 圖二面板、按鈕、比例、間距與分隔線回收到單一正式 CSS。
- [x] 390／375／360 響應式與水平溢位驗證。
- [x] 核心篩選、切換與展開互動驗證。
- [x] 參考圖與最終實作同一輸入並排比對。

final result: passed
