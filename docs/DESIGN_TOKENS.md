# Design Token 對照

正式 Token 檔案：`src/design-tokens.css`

## 類別

| 類別 | CSS 前綴 | 用途 |
|---|---|---|
| 基礎色 | `--lottery-neutral-*`、`--lottery-gold-*` | 背景、文字、金色系 |
| 狀態色 | `--lottery-status-*` | 啟動、聚合、共振、臨界 |
| 語意色 | `--lottery-card-*`、`--lottery-border-*`、`--lottery-text-*` | 元件樣式 |
| 尺寸 | `--lottery-card-*`、`--lottery-ball-*`、`--matrix-status-*` | 高度、間距、圓角、球體尺寸 |

首頁樣式由 `src/prototype.css` 引用 Token：

```css
@import "./design-tokens.css";
```

工程調整時，需先確認是否為全域 Token。不得為了單一頁面直接更改會影響其他既有元件的 Token。

