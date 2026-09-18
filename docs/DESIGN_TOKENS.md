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
| `--home-frame-bright` | `#f0d58c` | 首頁開獎資訊（含時間格）與 Matrix Core 的 1px 明亮金框 |
| `--home-frame-gold` | `#d6b66f` | 四個 Matrix 狀態的 1px 標準金框；Selector 框與導覽分隔線以透明度引用 |
| `--home-frame-muted` | `#8a713f` | 四大功能的 1px 低亮度金框 |
| `--layout-page-inline` | `16px` | 一般手機頁面與首頁內容區統一使用 16px 左右留白 |
| `--layout-section-gap` | `8px` | 主要區段節奏 |
| `--lottery-card-radius` | `10px` | 標準卡片圓角 |
| `--bottom-navigation-height` | `70px` | 固定底部導覽高度 |
| `--bottom-nav-panel-950` | `#030708` | 保留的深色面板 token；導覽改用 panel-900 |
| `--bottom-nav-icon-default` | `#c3beb6` | 保留的未選中圖示色；導覽圖示改繼承文字 currentColor |
| `--bottom-nav-text-default` | `#c3beb6` | PD01 未選中文字 |
| `--bottom-nav-text-active` | `#ffe2a0` | PD01 選中文字 |

響應式外殼由 `src/styles.css` 的 `--app-layout-max: 430px` 控制，實際寬度維持 `100%`；`--layout-dialog-inline`、`--layout-card-padding` 使用 `clamp()` 在 320–430px 間平滑調整，並透過安全區 token 保留瀏海與底部手勢空間。

首頁樣式由 `src/prototype.css` 引用 Token：

```css
@import "./design-tokens.css";
```

工程調整時，需先確認是否為全域 Token。不得為了單一頁面直接更改會影響其他既有元件的 Token。

導覽背景與安全區使用 `--bottom-nav-panel-900: #07101a`；選中圖示、文字與 12×2px 指示線共用 `--bottom-nav-gold: #e5b34d`。未選中圖示與文字繼承 `--bottom-nav-text-default: #c3beb6`，按鈕透明度 .7。

## PWA frame hierarchy — 2026-09-15

The approved homepage palette is the sole color source. Runtime ownership remains
`src/design-tokens.css`; non-home production pages consume these semantic aliases.

| Runtime token | Exact value | Role |
|---|---|---|
| `--pwa-frame-primary` | `var(--home-frame-bright)` | 1px title/main-card frame |
| `--pwa-frame-secondary` | `var(--home-frame-gold)` | 1px content/result/table frame |
| `--pwa-frame-tertiary` | `var(--home-frame-muted)` | 1px resting control frame |
| `--pwa-frame-divider` | `color-mix(in srgb, var(--home-frame-gold) 18%, transparent)` | Quiet internal table/section lines |
| `--pwa-frame-radius` | `var(--home-frame-radius)` | Shared 8px frame radius |
| `--pwa-control-surface` | `var(--lottery-neutral-950)` | Resting control surface |
| `--pwa-control-selected` | `color-mix(in srgb, var(--home-frame-gold) 6%, var(--lottery-neutral-950))` | Selected control/CTA surface |

Title frames remain in `.product-header__frame` and `.product-header__settings-card`.
The merged settings header owns one outer frame; its nested title frame remains 0px.
`.panel` owns content frames. `.select-box, .native-select` owns real control borders;
cut-corner pseudo-element frames and their scoped overrides are removed. Segmented
controls and hit options share one resting/selected appearance owner. Existing
page-specific rules retain layout responsibilities only where that appearance is
already inherited. CTA sparkle opacity is .20 with no extra lower-edge glow.

These rules supersede older non-home frame colors, corner radii and ornamental
gold-glow descriptions only. Existing geometry, accessibility focus indicators,
semantic error/success colors, number marks, lottery balls, embedded membership
artwork, homepage animation and approved homepage spacing remain unchanged.
Intentional borderless inner wrappers do not gain a second frame. No route,
component behavior, copy, API or worker changes are included.

Verification: `tests/pwa-frame-system.test.mjs` and
`tests/pwa-frame-system.spec.ts` (real production router, isolated test responses).
