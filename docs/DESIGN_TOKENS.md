# Design Token 對照

正式 Token 檔案：`src/design-tokens.css`

## Model B: existing runtime canonical

`src/design-tokens.css` 是 token 的 authoring 與 runtime owner。專案根目錄的 `DESIGN.md` 是既有正式值與視覺意圖的描述性 mirror，不是 CSS generator；`tests/premium-contract.test.mjs` 是兩者的 drift gate。

Token 更新必須先在 canonical CSS owner 完成，並在同一 changeset 同步本文件與 `DESIGN.md`。本次 remediation 永遠不從 generated documentation 反向產生或覆寫 `src/design-tokens.css`。

## 類別

| 類別 | CSS 前綴 | 用途 |
|---|---|---|
| 基礎色 | `--lottery-neutral-*`、`--lottery-gold-*` | 背景、文字、金色系 |
| 狀態色 | `--lottery-status-*` | 啟動、聚合、共振、臨界 |
| 語意色 | `--lottery-card-*`、`--lottery-border-*`、`--lottery-text-*` | 元件樣式 |
| 尺寸 | `--lottery-card-*`、`--lottery-ball-*`、`--matrix-status-*` | 高度、間距、圓角、球體尺寸 |

## Maintained value trace

| Runtime token | Exact value | DESIGN.md role |
|---|---|---|
| `--lottery-neutral-950` | `#02070c` | 應用背景 |
| `--lottery-gold-500` | `#c49145` | 標籤金色 |
| `--lottery-gold-300` | `#f4ce67` | 選取與亮金狀態 |
| `--layout-page-inline` | `16px` | 一般手機頁面左右留白；首頁內容區可使用 12px 局部覆寫 |
| `--layout-section-gap` | `8px` | 主要區段節奏 |
| `--lottery-card-radius` | `10px` | 標準卡片圓角 |
| `--bottom-navigation-height` | `82px` | 固定底部導覽高度 |

響應式外殼由 `src/styles.css` 的 `--app-layout-max: 430px` 控制，實際寬度維持 `100%`；`--layout-dialog-inline`、`--layout-card-padding` 使用 `clamp()` 在 320–430px 間平滑調整，並透過安全區 token 保留瀏海與底部手勢空間。

首頁樣式由 `src/prototype.css` 引用 Token：

```css
@import "./design-tokens.css";
```

工程調整時，需先確認是否為全域 Token。不得為了單一頁面直接更改會影響其他既有元件的 Token。
