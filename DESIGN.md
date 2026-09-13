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

2026-09-08：探索、天工、天衍、狀態的驗證過程下方「本期預測」數字統一呈現粗體。共用來源為 `src/explore-result-preview.css` 的 `.explore-validation-prediction b`，沿用 18px／800 與既有等寬字型；僅此數字允許 `font-synthesis: weight`，在裝置缺少粗體字型時仍可顯示粗體。

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

### PWA 共用標題卡 — 2026-09-12

首頁以外的 PWA 頁面統一由 `src/features/BrandHeader.tsx` 與 `src/feature-pages.css` 的 `.product-header*` 擁有標題卡，沿用探索頁的黑金樣式。首頁 Logo、首頁排列與獨立管理後台不屬於此次遷移。

一般標題卡與工具頁收合狀態的外框高度為 68px、寬度為頁面寬度扣除左右各 16px，與下方內容間距 8px；單層 1px 金框、10px 圓角、深黑底；探索、天衡、天衍、天工保留參考圖 06 暗金曲線；同星、號碼對照單、歷史開獎紀錄保留 07 幾何線條。2026-09-13 依使用者提供的標題卡參考，其餘 PWA 功能頁（含牌單、指南、計算機、狀態、我的、通知及子頁）採黑金弧光：深色細紋、Logo 區域暖金反光與底部弧形金線，由靜態 `header-gold-arc.svg` 呈現，不將文字或 Logo 烘焙進背景。`BrandHeader` 單獨決定 flow／geometric／gold-arc，三個互斥的屬性選擇器各提供一個背景來源，`.product-header__frame` 統一繪製；首頁品牌區沿用原樣。Logo 使用完整 `matrixYY.png`，56 × 48px、等比例呈現；2026-09-14 依使用者要求降低亮度，由既有 `.product-header__mark` 將亮度設為 85% 並移除額外光暈。返回箭頭 22px、觸控範圍 44 × 44px；通知、我的主頁與原本沒有返回鍵的頁面不新增返回鍵，但保留共用 44px 返回鍵欄位與 10px 欄距，原有返回目的地及快捷返回回呼維持不變。

主標題暖金色 `#f0c85f`、700、20px 上限，副標以 9px 灰金色為上限，極窄文字欄依 cqi 等比例縮小，靠左對齊、兩行間距 4px。主副標各自固定單行，不以換行、刪字或省略號改變頁名。主標依文字長度使用共用 short／regular／medium／long 字級範圍，搭配標題內容容器的 cqi 自動縮小；不得以額外 inline style、補償位移或覆寫控制字級。同星、號碼對照單、歷史紀錄使用共用 `HeaderSettingsButton`，位於標題內右距 4px、下距 0px，文字與右側下拉箭頭間距 2px；主標題的 grid 區域跨過操作欄，固定 35px 文字組保留主標基線，副標為操作入口預留寬度，這三頁的英文副標字距採 .2em，保留既有字級並拉開與設定入口的留白；其他頁面副標維持 .32em，由既有共用規則與設定卡變數擁有；70px 操作欄只保留 12px 暗金文字與右側收合箭頭，移除左側漏斗；按鈕高 24px，各狀態均為透明底，無獨立亮框或光暈，hover／active 以文字顏色回饋，鍵盤焦點框保留。三頁由 `BrandHeader` 的 settings 插槽整合標題與設定，外層單一黑金卡框，內部以低亮度金色細線分隔。首次展開置於正常頁面流；收合後再展開時，整張卡以 sticky 標題為定位來源浮於結果上方，標題佔位仍為 68px，不再讀取 viewport 座標或搬移設定 DOM。草稿與結果捲動保留，Escape 收合並將焦點送回入口。其他頁面的 60px 操作欄與 20px 按鈕不變。歷史重設移至設定第一列最右側，與彩種、排序同列；對照單刷新與彩種、歷史範圍、排序同列。重設／刷新共用 `.tool-settings-reset`，26px 高、10px 字與圖示；第一列分別預留 52px／42px，縮減既有下拉欄位寬度。三頁第一列以 `.tool-settings-primary-row` 共用 4px 小切角、1px 暗金描邊與深黑底，不加光暈，hover／focus 提亮描邊；由 `src/responsive-feature-pages.css` 唯一擁有。第二列及查詢處理維持不變。不為沒有操作按鈕的頁面預留下方空白列，文字起點不受按鈕數量影響。主標行盒固定 22px，使用 18px 零寬基線支架對齊縮字後的文字；副標起點、Logo 位置與文字左緣固定。

已遷移共用 FeatureShell、歷史與同星工具 shell、通知頁、探索結果預覽及我的所有子頁。移除圖片式標題與舊版品牌列渲染分支、`brand-header-unify.css` 及其他樣式檔的標題尺寸與操作位移規則；舊圖檔保留給未遷移的獨立素材用途，不再用於 PWA 標題。本文不授權修改任何查詢、會員、付款、通知或後端行為。

### Navigation and data display

2026-09-13：Matrix 牌單的順球／落球按鈕列左右留白各 18px，按鈕間距 8px、高度 34px。共用 `FeatureShell` 以 `bodyLayout="matrix-card"` 選用牌單網格；彩種、牌單預覽、下載按鈕與狀態訊息位於內容欄，保留左右各 16px；按鈕欄在內容欄兩側各內縮 2px。`src/feature-pages.css` 是唯一排版來源，標準 `.feature-body` 留白規則明確排除牌單網格，不以負外距、位移或行內樣式補償。牌單容器保留 10px 內距、6px 內框與完整等比例圖片，移除舊縮圖尺寸、舊票券裝飾規則及 `matrix-ticket--preview` 覆寫層；下載按鈕沿用共用品牌外觀與 44px 高度。

同日清理牌單可命中的共用舊規則：`.feature-screen` 合併於原本較後方的正式容器規則，保留既有套用順序；內容底部由非首頁的直接子層規則單獨保留「底部導覽避讓值 + 8px」。共用 48px 操作高度明確排除牌單下載變體，44px 由 `.matrix-card-download-action` 單獨擁有；品牌裝飾 `::before` 與 `::after` 各自設定位置。外層 `.app-screen` 背景僅由 `src/prototype.css` 擁有，移除 `src/styles.css` 的舊白底。品牌背景、選取狀態、安全區與鍵盤避讓沿用現有行為。

2026-09-12：依使用者選定的 PD01「階梯裝飾」重製共用底部導覽。外框左右外距為 0、滿寬，72px 主體下方接瀏覽器安全區；Figma 匯出的 `public/assets/lottery/navigation/pd01-frame.svg` 與 `pd01-active.svg` 分別承載階梯金框、扇形角飾及選中拱框，圖示與 12px 文字由四個真實按鈕呈現。圖示 24px、圖文距離 4px，選中態以金拱、底座、亮金字及 `aria-current` 共同表示；180ms 淡入支援 reduced motion。框內兩側各 44px 為角飾與設定操作區，其餘空間四格等分；這是內部配置，不是導覽外距。首頁與狀態頁的既有設定齒輪保留 44px 觸控區及原視覺尺寸，與主導覽觸控區不重疊。`src/prototype.css` 是導覽樣式唯一來源，移除舊「我的」按鈕 4px 位移補償。

PD01 導覽專用 token：底色 `--bottom-nav-panel-950: #030708`、未選中圖示 `--bottom-nav-icon-default: #e0bd75`、未選中文字 `--bottom-nav-text-default: #c3beb6`、選中文字 `--bottom-nav-text-active: #ffe2a0`；其他元件色彩不由此變更。

2026-09-12：Matrix 探索、天衡、天衍、天工在「探索設定」標題同列右側共用文字分段切換，依探索、天衡、天衍、天工排列。`MatrixPageSwitcher` 保留完整 accessible name、`aria-current` 與既有導覽回呼；當前頁以金字、淡金底及粗體標示。單一 1px 金褐色外框、8px 圓角、26px 高、176px 可收縮寬度，由 `src/feature-pages.css` 擁有全部切換樣式；移除 `src/matrix-explore-spacing.css` 舊圖片入口的覆寫。探索頁期數與版路欄位恢復使用共用 `SettingLabelIcon`，圖片為 `/assets/matrix-explore/period.png` 與 `/assets/matrix-explore/road.png`，維持 1.8rem 佔位。

首頁由品牌、彩種切換、最新開獎、下次開獎、Matrix 狀態、Matrix Core、功能入口與底部導覽組成，詳見 `docs/COMPONENT_MAP.md`。Matrix Core 與四大功能入口保持分離。表格、歷史卡與彩球不因文件化而改變密度、順序或響應式幾何。

2026-09-12 首頁 Core 與四大功能依使用者選定的黑金插畫參考圖更新。`src/homepage/base.css` 統一擁有兩區排版、金屬切角九宮格框與按壓回饋；不再疊加舊金框遮罩或持續閃爍軌跡。Core 與功能列對齊 16px 左右邊界，Core 比例 654:181，兩區間距 8px；四張卡單列等寬、間距 6px。2026-09-14 依使用者確認，四卡高度固定為 90px，移除撐高卡片的直式比例與未使用的比例變數；插畫在剩餘圖片區等比例縮放，文字沿用既有字級。功能列使用 0 內距與 0 外框，不繪製整列背景或圓角，讓第一張卡左框、第四張卡右框直接對齊 Core 外框；各卡既有 4px 金屬圖框保留。Core 主視覺與標題使用專用 WebP，中文說明與箭頭保持真實 UI；四卡插畫等比例 contain，名稱為真實文字。新素材位於 `public/assets/lottery/home-premium/`。入口依序為 Matrix 同星、Matrix 對照、Matrix 牌單、Matrix 指南；計算機沿用底部導覽與快捷設定入口。其他首頁區塊保留現有設計。

Matrix 探索、天衡、天衍、天工與狀態頁的驗證過程，依鎖定條件整組交替使用 `#152A42`、`#0E1D30`。探索、天衡、天衍與天工的左、中、右三欄共用同組底色，欄間與列間間距統一透出純黑 `#000`；狀態頁維持既有頁面背景。既有結果的期號、特別號與欄寬依產生該結果的彩種呈現，探索設定尚未提交時不改變結果版面。版路摘要的公式序列以獨立文字節點呈現，加減版路例如 `+5`、`.`、`15`，合值序列為 `合值`、`5`、`.`、`15`（不顯示 `+`）；相鄰文字節點間距皆為 1px。

2026-09-08：首頁 Logo 以當前尺寸等比例放大 5%，百分比寬度僅由 `src/homepage/logo-spacing.css` 擁有，高度沿用自動比例；移除 base 中重複的尺寸宣告。狀態卡與 Matrix Core 間距由 `src/homepage/base.css` 的 `--home-gap-status-core` 隨視窗高度限制在 9–12px；移除狀態容器底部額外 1.5px 留白，使外框間距直接由此變數控制。首頁兩列依內容高度由上排列，移除會把剩餘高度撐在狀態卡與 Core 之間的 1fr；底部導覽仍維持固定。不得新增覆寫或固定 Logo 高度。

### 首頁固定 Logo — 2026-09-09

首頁 Logo 固定於內容捲動區上方，沿用正式 MatrixLogo 素材、91.9632% 流動寬度、自動比例高度與 390px 內容寬度上限。`src/homepage/base.css` 擁有首頁固定品牌列與下方捲動區的排列；`src/homepage/logo-spacing.css` 統一擁有品牌列與 Logo 的幾何樣式，品牌列保留自然高度，卡片不會滑入其後方。底部導覽與其他頁面的 Logo 行為維持既有設定。

2026-09-14：依使用者確認的第一輪修正，首頁容器以 `inset: 0` 填滿畫布，頂部安全區只由 `padding-top: var(--layout-safe-area-top)` 避讓一次。品牌列使用 8px 頂部內距與自然高度，移除 Logo 負位移及品牌列扣減高度公式；圖片以真實尺寸 2154 × 634 預留比例，避免下載前後版面跳動。下方原生捲動區接在品牌列之後，保留既有卡片間距。

### Home Mark Six numbers — 2026-09-06

首頁六合彩採使用者確認的 A 方案：保留彩球素材與尺寸，數字由 15px 縮小 10% 至 13.5px，字重由 900 降至 800，沿用白色區域的中心定位與既有光學微調。`src/number-ball.css` 是此首頁變體的唯一樣式來源；既有 Roboto 800 字型檔以首頁六合彩專用字型名稱載入，避免改變其他介面原有的字重匹配。歷史頁、其他彩種與彩球間距不在此次修改範圍。

### Home five-ball numbers — 2026-09-10

依使用者要求，首頁開獎資訊卡的今彩539、天天樂數字由 700 加粗至 800。`src/number-ball.css` 擁有此首頁彩種變體，共用既有 `Roboto Mark Six Home` 的 Roboto 800 字型檔；保留原有 20px 字級、彩球大小、位置、間距與無底線樣式。六合彩、大樂透及歷史介面維持既有字重。

### Profile membership cards — approved A+B

「我的」頁的會員資料卡與目前訂閱狀態卡採已確認的 A+B 參考：切角雙金框、低透明度 M、資訊分區與金色方案／日期。`src/feature-pages.css` 是兩張卡片的特定樣式唯一來源；裝飾素材位於 `public/assets/lottery/membership/`，框線以 border-image 適配內容高度。沿用既有 16px 頁面留白；兩張卡片置於同一個圓角深色底座，卡片盒模型間距固定為 1px，搭配框圖內緣形成參考圖的可見間距，後續一般區段仍維持 8px。資料繫結與導覽不變。LINE 暱稱保持資訊文字；登入／登出與訂閱入口保留至少 44px 觸控高度，視覺框線可在觸控區內縮。320–430px 使用流動版面，窄螢幕允許說明換行，長暱稱沿用既有縮字與省略策略。

### Legal information pages — approved complete layout

「服務內容與使用說明」「會員服務條例」「隱私權政策」「退款規範」「聲明與免責事項」共用 `LegalInfoDocument` 與 `LegalInfoSection`，各頁使用一個金框容器，頂端顯示頁名，章節之間以細分隔線區分。`src/feature-pages.css` 的 `.legal-info-*` 是唯一樣式來源，取代原 `.service-info-document` 規則；其他資訊頁的 `DetailCard` 維持原狀。

沿用 16px 頁面留白、12px 容器內距，分隔線為 1px 金褐色 `#8a6d3b`，上下各 12px；頁名 18px、章節標題 15px、正文 13px／1.65 行高、段距 8px。Matrix Core 的探索／天衡／天衍／天工以無圓點子清單縮排，功能項目間距為 4px；彩種採兩欄兩列，訂閱方案每個方案以完整一行靠左呈現，方案之間沿用 6px 行距。郵件連結使用與標題相同的暖金色並保留底線。原文、價格、天數、章節及閱讀順序不變，窄螢幕允許換行，容器隨內容增加高度。

### Contact support and referral layout — 2026-09-06

聯絡客服、問題回報、商務合作維持三張卡片，標題保留金色與 15px；信箱使用 14px 淺灰白 `#c9c2b8` 及底線，hover 使用 `#f1ece3`，與標題金色區分。三張卡片的信箱前顯示「信箱：」，標籤在連結外、不加底線，只有信箱地址保留底線。標籤與連結使用兩欄排列，標籤保持完整，長信箱在右欄換行。2026-09-08 依使用者要求移除客服電話列、撥號連結與電話列專用間距；`src/feature-pages.css` 擁有此頁聯絡資訊樣式。

推薦成功人數在「我的推薦碼」同列靠右。推薦碼標籤獨立一行，下行使用完整推薦碼與右側複製按鈕；窄螢幕允許長碼換行，不截斷內容。三個推薦說明標題左側與輸入框對齊，啟動碼使用說明保留原縮排。「確認」字級為 16px，按鈕沿用 34px 高度；推薦摘要與排列由 `src/feature-pages.css` 擁有，精簡控制尺寸由 `src/activation-code-layout.css` 擁有。資料、文字、登入狀態、確認、複製與展開流程維持原邏輯。

### Forms and overlays

2026-09-08 依使用者截圖縮減註冊引導與自訂條件介面：註冊引導使用共用 AppDialog 的 `registration-guide` 變體，寬 268px、28px 圖示與 15px 標題同列、12px 靠左正文；按鈕保留 44px 觸控高度。共用彈窗焦點使用該語意色的 1px 細框，取代白色粗框。自訂條件依後續要求改為彩種下方單列「探索期數：十三期 | 探索範圍：完整範圍」，兩側等寬讓分隔符固定於中央；預設／自訂狀態移至一碼條件標題右側；版路複選沿用 `.segmented-static` 金色選取樣式，原生 checkbox 覆蓋整格且保留鍵盤操作。後續整體整理採收合群組：區段標題14px/600、群組名稱13px/600暖白、摘要11px/400灰白；欄位標籤12px/400，值13px/500，欄位及版路按鍵30px、列距6px。群組收合標題最少52px，內容左右10px；新增條件28px、新增群組30px、儲存與重置34px；底部操作列以共用導覽清除高度加8px留距，避免遮住操作；取消卡內新增按鍵的虛線框，範圍端點直接並排，重複摘要與端點標籤僅保留供輔助技術讀取。原有條件、文案、儲存與重置流程不變。

2026-09-08 自訂觸發條件：標題、彩種列與四狀態列造型保留原樣；後續依使用者要求，排列順序為彩種、四狀態、探索單列摘要、一碼條件、兩碼條件；探索摘要標籤、值與置中分隔符統一使用正文白色。每個預設規則為獨立8px圓角細金框收合群組卡，沿用深藍／金色。群組預設收合，單條件摘要呈現連準與同碼範圍，多條件顯示同時符合項數；點擊標題或鍵盤啟閉，刪除按鍵獨立於收合標題。版路標籤下方使用整列複選按鍵，其餘欄位以標籤與輸入兩欄對齊排列，連準與同碼範圍的兩個端點並排，窄螢幕使用minmax(0,1fr)收縮。卡內「＋ 同時符合」、卡間「或」標示關係。src/feature-pages.css的custom-status選擇器擁有樣式，不改全域token與上方三列。

2026-09-09 自訂觸發狀態依使用者更新：四張狀態卡改為 8px 圓角雙框，按原流動高度減少 6px（上下各 3px），保留 13px／7px 文字。下方摘要間距 8px，依「探索期數：十三期 | 探索範圍：完整範圍 | 使用預設條件／使用自訂條件」排列，三欄共用灰白次要文字、400 字重及 10–11px 流動字級，兩分隔符各居相鄰欄位中央。移除可見的群組編號標題，保留條件摘要與收合操作；摘要列最少 32px，欄位／版路／新增按鈕 24px，新增按鈕依內容寬度；重置／儲存按鈕 28px 並以內容寬度靠右排列。樣式由 `src/homepage/lottery-switcher.css` 與 `src/feature-pages.css` 既有規則擁有，原來自訂狀態卡共用的切角框規則移除。

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

天衍驗證右欄的鎖定來源列保留空白；歷史規則僅顯示已命中的列，來源與命中結果保持對齊，本期預測規則仍完整呈現。摘要每組兩行共用自動適配字級，首行預留連準標籤空間；次行鎖定條件留白，第一個分隔線與首行第一個分隔線對齊。


### Matrix status validation — 2026-09-07

狀態頁四彩種的四張狀態卡，收合與展開時外框距頁面左右各 13px；標題與彩種切換維持既有位置。狀態頁驗證過程共用探索的字型大小、內外距與交錯背景樣式，驗證內容距狀態外框內緣左右各 6px。`src/feature-pages.css` 擁有狀態卡外距；`src/explore-result-preview.css` 與 `src/matrix-explore-result-refinements.css` 共用驗證呈現。


## Matrix 筆記本 — 2026-09-08

筆記本只提供列表與筆記編輯，沿用頁面左右 16px、標題卡下方 8px。`src/feature-pages.css` 是筆記本版面的樣式來源；圖示使用同一個 42px 尺寸，工具列由圖示與操作欄兩欄組成，間距 8px；操作欄採可收縮寬度，刪除位於新增筆記上方，兩者字級 11px、正常字級下高度 26px。筆記摘要上下內距 5px，點選後進入獨立編輯頁。寫入筆記沿用 `primary-action branded-explore-action`，字級 14px、正常字級下高度 36px，允許放大文字時增加高度。不要再增加重複標題或卡片尾端的筆記刪除入口。



### Core lottery tabs and integrated settings — 2026-09-12

四個核心頁面與牌單共用同一個 `LotteryTabs` 樣式，置於標題卡下方 8px，四彩種等寬、36px 高、14px 文字，選中項目使用金字與文字等寬的 2px 金色底線，列下方間距 8px；支援左右方向鍵與 Home／End。彩種切換沿用原有 state setter／changeLottery，不另增 API 或變更查詢規則。移除設定卡內彩種 select。探索、天衡與天衍的命中按鈕、進階設定歸入各自設定卡，不顯示獨立命中條件卡；天工沿用既有兩段設定。設定區一般 segmented 選項與條件按鈕皆為 20px，文字字級不變。背景皆為低亮度靜態 SVG，不加入動畫。

所有 PWA 標題與下方內容的 8px 由 `.product-header` 的 margin-bottom 唯一擁有，header 不再含底部 padding。歷史、對照單與同星的設定整合於標題卡內，浮動展開仍沿用同一卡框。移除通知與探索結果預覽額外的頂部 padding。

彩種 Tabs 與牌單維持共用樣式；四頁切換為 26px 高、12px 字級、淡金選中底。期數／版路保留 20px 與原字級，三欄採等寬 grid、欄距 6px，標籤垂直置中。依最新條件按鈕調整，探索、天衡、天衍條件列與上方 segmented 選項共用正式按鈕樣式：20px 高、10px 圓角、12px 字級、相同框線與淡金選中底。兩個選項等寬、間距 6px；天衍單選項佔滿右側欄位。移除相連分段外框與分隔線，保留完整文字、700／500 主次字重及欄位對齊。

核心頁面 `--lottery-tabs-bottom-gap: 0px` 由既有 8px row-gap 單獨提供 Tabs 與設定卡的距離，避免疊加為 16px；其他共用 Tabs 頁面保留原邊距。四頁切換外框與分隔線金褐色透明度分別 .48／.28，高度 26px、字級與位置維持。未選中期數／版路採暖灰 #ded6c9、清楚暗金框 #7d6a4c；選中為金字 #f1c75a、淡金底與 #c49a46 外框，只有 disabled 才以 .4 透明度淡化。命中主文字 700、鎖定碼數 500，同為 12px，完整 accessible name 與選取行為維持。


2026-09-12 條件列整合：探索、天衡、天衍的條件列分別顯示「探索條件」「天衡條件」「天衍條件」，共用設定元件的可見標籤與 accessible name 一致；圖示使用 `/assets/lottery/functions/探索條件.png`，共用上方欄位的 1.8rem 圖示、13px 標籤、8px 圖文間距、6px 欄距及 7px 列距；選項左右對齊上方控制欄。天衡與天衍的設定、期數、日期、範圍與進階設定分別使用各自頁名；天工的設定、期數、球位使用天工字樣，保留原圖檔路徑。

條件選項顯示半形括號，左括號前恰好一個 U+0020 半形空格，例如 `準5+ (鎖定2碼)`。共用 `MatrixExplorePage` 僅格式化可見文字與按鈕 accessible name；原有條件值、預設選取及查詢參數保留。`.hit-lock-detail` 由 `src/matrix-explore-spacing.css` 保留這個文字空格，維持原來 700／500 主次字重。

2026-09-14 選單外框整理：同星第二列期數與第一列選單共用 `responsive-feature-pages.css` 的切角、底色、框色及 hover／focus 變數；26px 高與66px 最小寬度維持原有擁有者。探索、天衡、天衍的「號碼順序」保留原生選單，移除誤用的 `.select-box` 切角裝飾類別，由 `matrix-explore-spacing.css` 原有控制規則單獨繪製 1px 金褐色細框與10px 圓角；控制外高24px，內部選單隨內容盒高度填滿，焦點以框線提亮呈現。結果欄位固定使用「結果期／結果／結果位置」，驗證末列使用「版路結果」，不隨訂閱購買顯示開關改名。指南於探索後加入天衡設定、比對及結果說明；服務說明的核心功能清單同步加入天衡。

天衡版路摘要依內容自然排列兩列：第一列「開 號碼 第N顆、同期 號碼 第N顆」，第二列「上／下／同期｜第N顆｜公式｜下N期開」。移除「開」跨兩列的獨立欄及指定 grid 位置，沿用共用列距、字級與數值顏色；連準標籤位置及演算法數值不變。

2026-09-14：方案頁標題使用「訂閱方案與收費標準」，通知頁標題使用「通知設定」。通知列表移除中獎通知列，沿用既有一般通知、Matrix 通知與系統通知分組。首頁缺少實際落球資料時顯示「實際落球順序待公布」，沿用 `homepage/base.css` 球號區的 flex 雙向置中，不增加位移補償。

### 天天樂號碼排序

同星、號碼對照單、歷史紀錄、探索、天衡、天衍、牌單與首頁開獎資訊卡，切換到天天樂時只使用順球。保留落球控制的位置與名稱，以原生 `disabled` 停用選項或按鈕；輔助說明為「天天樂僅提供順球」。首頁與牌單由各自原有樣式來源定義唯一的停用狀態，透明度 .55、一般游標，尺寸與間距不變。天天樂牌單不顯示落球「待公布」，其他彩種仍沿用原本的資料就緒判斷。
