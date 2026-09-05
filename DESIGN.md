---
version: alpha
name: "樂彩 Matrix"
description: "深海軍藍與金色資訊層次構成的繁體中文行動彩券分析 PWA"
colors:
  background: "#02070c"
  surface: "#071018"
  primary: "#c49145"
  selected: "#f4ce67"
  text-primary: "#f5f2ea"
  text-secondary: "#aaa7a2"
typography:
  interface:
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
  numeric:
    fontFamily: "Roboto, Arial, sans-serif"
  traditional-chinese:
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, Noto Sans TC, PingFang TC, Microsoft JhengHei, sans-serif"
rounded:
  DEFAULT: "10px"
  status-card: "8px"
spacing:
  page-inline: "16px"
  section-gap: "8px"
  bottom-navigation-height: "72px"
components:
  app-canvas:
    backgroundColor: "{colors.background}"
    textColor: "{colors.text-primary}"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.DEFAULT}"
  selected-control:
    backgroundColor: "{colors.background}"
    textColor: "{colors.selected}"
  label:
    backgroundColor: "{colors.background}"
    textColor: "{colors.primary}"
  secondary-copy:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text-secondary}"
  bottom-navigation:
    height: "{spacing.bottom-navigation-height}"
  native-select:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text-primary}"
  native-date:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text-primary}"
---

# 樂彩 Matrix Design System

## Overview

### Creative North Star

介面延續夜間開獎資訊板與金色票券描邊的既有語彙：深海軍藍承載高密度資料，暖金只標示選取、標題與關鍵動作。彩球、彩種品牌素材與 Matrix 狀態圖像是辨識核心，不另加與資料無關的裝飾。

### Product context and register

- **Audience and primary job:** 使用繁體中文的手機使用者查閱今彩539、天天樂、六合彩與大樂透資料，並使用 Matrix 分析、會員與通知功能。
- **Target market and evidence:** 產品彩種、介面內容與 `docs/COMPONENT_MAP.md` 指向臺灣彩券資料使用情境；本文件不把語系本身當成市場證明。
- **Locale and language policy:** 應用介面為 `zh-TW` 繁體中文；HTML 語言標記維持現行 `zh-Hant-TW`。第三方或 OS 原生彈出層接受支援平台提供的在地化。
- **Usage scene:** mobile-first、可安裝 PWA，主要在窄螢幕、觸控與安全區域內快速查詢；桌面 runtime 仍以手機畫布呈現。
- **Register:** 產品介面。資料辨識、狀態與操作一致性優先於行銷表現。
- **Memorable signature:** 深藍底上的金色 Matrix 狀態、彩球與票券輪廓。
- **Restraint:** 表單、歷史資料、會員與通知頁保持安靜且可掃讀；金色不擴張成大面積發光裝飾。
- **Anti-references:** 不轉成泛用 SaaS 白色卡片、不套用紫藍漸層科技模板，也不使用霓虹賭場裝飾；這些方向都會削弱既有彩種與資料層次。
- **Token ownership/runtime mapping:** Model B applies. `src/design-tokens.css` is the authoring and runtime owner; `DESIGN.md` is a maintained descriptive mirror. `docs/DESIGN_TOKENS.md` records the mapping and `tests/premium-contract.test.mjs` rejects drift. This file does not generate CSS.

## Colors

`#02070c` 是應用與裝置畫布背景；`#071018` 是主要卡片表面。`#c49145` 用於標籤與次要金色層級，`#f4ce67` 用於選取邊框與高優先視覺狀態。正文以暖白 `#f5f2ea` 呈現，次要資訊使用 `#aaa7a2`。狀態綠、藍、紫、橙沿用 runtime token，不以金色取代其語意。高對比模式由系統色與可操作的原生控制優先。

| Runtime token | Exact value | Role |
|---|---|---|
| `--lottery-neutral-950` | `#02070c` | 應用背景 |
| `--lottery-gold-500` | `#c49145` | 標籤金色 |
| `--lottery-gold-300` | `#f4ce67` | 選取與亮金狀態 |

## Typography

介面以現行 Inter／system stack 為基礎；Roboto Latin 500／700 由 `@fontsource/roboto` 明確匯入，供數字、球號與部分品牌資料使用。這兩個 import 只提供 Latin subset，繁體中文字形則落到 system TC fallback stack：`system-ui`、Noto Sans TC、PingFang TC 或 Microsoft JhengHei。資料數字可使用 tabular figures；控制文字維持繁體中文的自然語序，不使用全大寫英文模擬科技感。字級、字重與行高仍由現有 CSS 元件規則擁有，本文件不新增 typography token。

## Layout

版面以 320–430px 的流動手機畫布與 mobile-first PWA 為準；390px 保留為主要視覺基準，而不是固定寬度。頁面左右留白、區段間距、卡片圓角與底部導覽高度都由 runtime token 控制：

| Runtime token | Exact value | Role |
|---|---|---|
| `--layout-page-inline` | `16px` | 一般手機頁面與首頁內容區統一使用 16px 左右留白 |
| `--layout-section-gap` | `8px` | 主要區段節奏 |
| `--lottery-card-radius` | `10px` | 標準卡片圓角 |
| `--bottom-navigation-height` | `72px` | 固定底部導覽高度 |

頂端與底部使用 `env(safe-area-inset-*)`，內容清除量由 `--layout-bottom-nav-clearance` 推導。資料面板可擁有內部捲動，但不得讓新容器遮住 72px 導覽或安全區；載入、失敗與 busy 狀態保留控制尺寸。 所有頁面保留滑動功能，但隱藏原生與應用程式捲動條。

## Elevation & Depth

層次主要由深藍表面差、細金色邊框與低強度 inset glow 建立；靜態資訊不用浮誇外陰影。對話框、bottom sheet 與 sticky surface 才可提高層級，且不能把視覺層級當作權限或成功狀態的唯一訊號。

## Shapes

標準卡片以 10px 圓角為基準，Matrix 狀態卡使用既有 8px 圓角；彩球、頭像、狀態點與少數標章可使用圓形或 pill。表單與動作控制沿用各 canonical component 的既有半徑，不把所有元件統一成 pill，也不改動正式素材比例。 首頁指定圖示與卡片使用響應式八角切角；開獎資訊卡與狀態區不顯示額外共同容器外框。

## Components

### Foundational visual states

互動控制沿用現有 default、hover、focus-visible、active、selected、disabled 與 busy 表現。鍵盤焦點必須可見，disabled 與 busy 不可再觸發動作；錯誤以文字與 `role="alert"` 或欄位關聯呈現，不只改色。日常載入使用既有 app-owned indicator，並保留最終內容幾何。

### Buttons and actions

金色實心或描邊控制表示主要品牌動作；中性動作用低強度邊框；刪除、登出與安全敏感動作保持文字、狀態與後果清楚。busy 時停用重複提交並維持按鈕尺寸。圖示必須與文字共用於非通用操作。

### Navigation and data display

首頁由品牌、彩種切換、最新開獎、下次開獎、Matrix 狀態、Matrix Core、功能入口與底部導覽組成，詳見 `docs/COMPONENT_MAP.md`。Matrix Core 與五大功能入口保持分離。表格、歷史卡與彩球不因文件化而改變密度、順序或響應式幾何。

Matrix 探索與天衍的驗證過程，依鎖定條件整組交替使用 `#12243A`、`#0E1D30`。左、中、右三欄共用同組底色，欄間與組間間距皆透出頁面黑色背景。既有結果的期號、特別號與欄寬依產生該結果的彩種呈現，探索設定尚未提交時不改變結果版面。版路摘要的公式序列以獨立文字節點呈現，加減版路例如 `+5`、`.`、`15`，合值序列為 `合值`、`5`、`.`、`15`（不顯示 `+`）；相鄰文字節點間距皆為 1px。

### Forms and overlays

Select/Listbox 與 Date 採 `UX-CONTRACT.md` 宣告的 OS 原生 ownership；封閉控制可沿用產品表面，但開啟的 popup／calendar 外觀與互動由支援平台擁有。產品表單使用 app-owned validation、`noValidate`、欄位關聯、first-error focus、busy 與可恢復錯誤。既有原生 `window.confirm()` 是已知債務，不視為正式 app-owned dialog。

### Iconography

介面沿用 Radix icons 與既有產品素材。功能性 icon 使用現行細線語彙並由可見標籤或 accessible name 說明；彩種、Matrix 狀態與首頁素材由 `docs/ASSET_MANIFEST.md` 管理，不改色、拉伸或裁切。

### Motion

動態只用於狀態切換、選取、面板開合與既有拖曳回饋，時間短且可中斷。`prefers-reduced-motion` 時不得靠動畫才能理解狀態；不加入純裝飾性持續動畫。

### Content and data visualization

動作採清楚的繁體中文動詞，例如「下載 PNG」、「邀請好友」與「登出」。失敗文案指出可重試方向。彩號、期別、日期與金額維持現有格式與資料 API 定義；分析結果不表述為中獎保證。

## Do's and Don'ts

- **Do:** 從 `src/design-tokens.css` 讀取 shared value，並在同一 changeset 同步本文件與 drift test。
- **Do:** 保留繁體中文、手機 safe area、彩種素材與深藍／金色資訊階層。
- **Don't:** 從 `DESIGN.md` 反向產生或覆寫 canonical CSS，也不要為單頁複製相同 token。
- **Don't:** 為了稽核改變版面、用假 handler 或把 provider credential 寫入持久儲存。
