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
  bottom-navigation-height: "70px"
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
| `--bottom-navigation-height` | `70px` | 固定底部導覽高度 |

頂端與底部使用 `env(safe-area-inset-*)`，內容清除量由 `--layout-bottom-nav-clearance` 推導。資料面板可擁有內部捲動，但不得讓新容器遮住 70px 導覽或安全區；載入、失敗與 busy 狀態保留控制尺寸。 所有頁面保留滑動功能，但隱藏原生與應用程式捲動條。

## Elevation & Depth

層次主要由深藍表面差、細金色邊框與低強度 inset glow 建立；靜態資訊不用浮誇外陰影。對話框、bottom sheet 與 sticky surface 才可提高層級，且不能把視覺層級當作權限或成功狀態的唯一訊號。

## Shapes

標準卡片以 10px 圓角為基準，Matrix 狀態卡使用既有 8px 圓角；彩球、頭像、狀態點與少數標章可使用圓形或 pill。表單與動作控制沿用各 canonical component 的既有半徑，不把所有元件統一成 pill，也不改動正式素材比例。首頁品牌、彩種切換、開獎資訊卡、Matrix Core 與四大功能沿用單層細金框及 8px 圓角；開獎卡底部兩格時間資訊同樣使用獨立的細金框及 8px 圓角，狀態區不新增共同容器外框。

2026-09-14 開獎資訊卡：`src/homepage/base.css` 單獨擁有主卡細金框、深色背景與低亮度金色弧線，移除 `visual-language.css` 的主卡切角與多層裝飾。1px 內描邊不佔內容空間，卡片寬高、網格、內距、彩球素材、彩球與數字尺寸及定位全部沿用現況。下次開獎／剩餘時間依後續確認也改為相同 1px 細金框與 8px 圓角，由 `base.css` 原有時間格規則單獨繪製；移除舊切角、多層裝飾及重複覆寫。保留兩格各 24px 高、原背景、圖示、文字色彩及資料更新；下次開獎／剩餘時間改為依各自內容寬度自動分配，兩格共用相同的彈性成長與縮減規則，兩組內容皆水平置中，使左右留白接近一致；原開獎背景圖保留於素材庫但不再用於主卡。

## Components

### Foundational visual states

互動控制沿用現有 default、hover、focus-visible、active、selected、disabled 與 busy 表現。鍵盤焦點必須可見，disabled 與 busy 不可再觸發動作；錯誤以文字與 `role="alert"` 或欄位關聯呈現，不只改色。日常載入使用既有 app-owned indicator，並保留最終內容幾何。

### Buttons and actions

金色實心或描邊控制表示主要品牌動作；中性動作用低強度邊框；刪除、登出與安全敏感動作保持文字、狀態與後果清楚。busy 時停用重複提交並維持按鈕尺寸。圖示必須與文字共用於非通用操作。

付款紀錄的「前往登入」及「重新載入」沿用 `primary-action branded-explore-action` 黑金按鈕，說明文字使用既有 `DetailCard` 段落樣式與間距。未登入提示保持中性，實際失敗才使用 `role="alert"`；不增加頁面專屬按鈕 CSS 或覆寫層。

### PWA 共用標題卡 — 2026-09-12

首頁以外的 PWA 頁面統一由 `src/features/BrandHeader.tsx` 與 `src/feature-pages.css` 的 `.product-header*` 擁有標題卡，沿用探索頁的黑金樣式。首頁 Logo、首頁排列與獨立管理後台不屬於此次遷移。

一般標題卡與工具頁收合狀態的外框高度為 68px、寬度為頁面寬度扣除左右各 16px，與下方內容間距 8px；單層 1px 金框、10px 圓角、深黑底；2026-09-19 套用使用者核准的 31 款純背景，並為同日新合併的天樞補上同系列背景，各頁使用 `public/assets/lottery/headers/` 對應 WebP 圖檔（2048 × 768，僅轉檔壓縮，不重繪或裁切）。背景來源由 `src/feature-pages.css` 的 `data-product-header` 選擇器單獨設定 `--product-header-background`，含探索頁，不再疊加頁面專用背景覆寫；未列出的標題沿用黑金弧光備援。`.product-header__frame` 保留原有 `center / cover` 繪製方式。通知、推薦碼、服務說明、客服與版本資訊的較長文字區使用共用背景暗化變數，保留圖案與既有文字位置，提高亮金裝飾後方的辨識度。同日依使用者確認的局部壓暗方案，指南、聲明與免責、天衡、天樞、天衍、狀態、歷史開獎號碼、同星與號碼對照單由原有背景來源選擇器啟用共用文字區暗化；歷史、同星、號碼對照單另將右下設定文字與箭頭後方納入暗化。暗化僅由既有標題背景繪製層負責，不改圖檔、字型、字級、版位、Logo、金框、卡片尺寸、點擊範圍或互動。32 款圖僅含裝飾，不含文字、Logo、返回鍵或外框；卡片大小、金框、Logo 及位置、返回鍵、主標與英文副標位置、頁面內容與功能全部維持原樣。首頁品牌區沿用原樣。Logo 使用完整 `matrixYY.png`，56 × 48px、等比例呈現；2026-09-14 依使用者要求降低亮度，由既有 `.product-header__mark` 將亮度設為 85% 並移除額外光暈。返回箭頭 22px、觸控範圍 44 × 44px；通知、我的主頁與原本沒有返回鍵的頁面不新增返回鍵，但保留共用 44px 返回鍵欄位與 10px 欄距，原有返回目的地及快捷返回回呼維持不變。

主標題暖金色 `#f0c85f`、700、20px 上限，副標以 9px 灰金色為上限，極窄文字欄依 cqi 等比例縮小，靠左對齊、兩行間距 4px。主副標各自固定單行，不以換行、刪字或省略號改變頁名。主標依文字長度使用共用 short／regular／medium／long 字級範圍，搭配標題內容容器的 cqi 自動縮小；不得以額外 inline style、補償位移或覆寫控制字級。同星、號碼對照單、歷史紀錄使用共用 `HeaderSettingsButton`，位於標題內右距 4px、下距 0px，文字與右側下拉箭頭間距 2px；主標題的 grid 區域跨過操作欄，固定 35px 文字組保留主標基線，副標為操作入口預留寬度，這三頁的英文副標字距採 .2em，保留既有字級並拉開與設定入口的留白；其他頁面副標維持 .32em，由既有共用規則與設定卡變數擁有；70px 操作欄只保留 12px 暗金文字與右側收合箭頭，移除左側漏斗；按鈕高 24px，各狀態均為透明底，無獨立亮框或光暈，hover／active 以文字顏色回饋，鍵盤焦點框保留。三頁由 `BrandHeader` 的 settings 插槽整合標題與設定，外層單一黑金卡框，內部以低亮度金色細線分隔。首次展開置於正常頁面流；收合後再展開時，整張卡以 sticky 標題為定位來源浮於結果上方，標題佔位仍為 68px，不再讀取 viewport 座標或搬移設定 DOM。草稿與結果捲動保留，Escape 收合並將焦點送回入口。其他頁面的 60px 操作欄與 20px 按鈕不變。歷史重設移至設定第一列最右側，與彩種、排序同列；對照單刷新與彩種、歷史範圍、排序同列。重設／刷新共用 `.tool-settings-reset`，26px 高、10px 字與圖示；第一列分別預留 52px／42px，縮減既有下拉欄位寬度。三頁第一列以 `.tool-settings-primary-row` 共用 4px 小切角、1px 暗金描邊與深黑底，不加光暈，hover／focus 提亮描邊；由 `src/responsive-feature-pages.css` 唯一擁有。第二列及查詢處理維持不變。不為沒有操作按鈕的頁面預留下方空白列，文字起點不受按鈕數量影響。主標行盒固定 22px，使用 18px 零寬基線支架對齊縮字後的文字；副標起點、Logo 位置與文字左緣固定。

已遷移共用 FeatureShell、歷史與同星工具 shell、通知頁、探索結果預覽及我的所有子頁。移除圖片式標題與舊版品牌列渲染分支、`brand-header-unify.css` 及其他樣式檔的標題尺寸與操作位移規則；舊圖檔保留給未遷移的獨立素材用途，不再用於 PWA 標題。本文不授權修改任何查詢、會員、付款、通知或後端行為。

2026-09-19 窄版可讀性修正：牌單、連碰計算機、立柱計算機、付款紀錄、銀行轉帳付款、關於樂彩 Matrix、退款規範、會員服務條例與隱私權政策沿用 `--product-header-copy-shade` 暗化文字區。通知設定與我的推薦碼／啟動碼的英文副標透過 `--product-header-long-subtitle-tracking` 依既有文字容器寬度收縮字距，寬度足夠時恢復 `.32em`；字級、字型、文字內容、卡片高度、Logo、返回鍵與設定按鈕位置不變。樣式仍由 `src/feature-pages.css` 的既有頁面選擇器及 `.product-header__copy > span` 單獨擁有，不增加覆寫層或 inline style。

同日依使用者追加要求，Matrix 天工與 Matrix 探索在既有背景來源選擇器中套用相同的 `--product-header-copy-shade`，僅暗化文字後方，保留原圖、字型、卡片與操作位置。

### Navigation and data display

2026-09-13：Matrix 牌單的順球／落球按鈕列左右留白各 18px，按鈕間距 8px、高度 34px。共用 `FeatureShell` 以 `bodyLayout="matrix-card"` 選用牌單網格；彩種、牌單預覽、下載按鈕與狀態訊息位於內容欄，保留左右各 16px；按鈕欄在內容欄兩側各內縮 2px。`src/feature-pages.css` 是唯一排版來源，標準 `.feature-body` 留白規則明確排除牌單網格，不以負外距、位移或行內樣式補償。牌單容器保留 10px 內距、6px 內框與完整等比例圖片，移除舊縮圖尺寸、舊票券裝飾規則及 `matrix-ticket--preview` 覆寫層；下載按鈕沿用共用品牌外觀與 44px 高度。

同日清理牌單可命中的共用舊規則：`.feature-screen` 合併於原本較後方的正式容器規則，保留既有套用順序；內容底部由非首頁的直接子層規則單獨保留「底部導覽避讓值 + 8px」。共用 48px 操作高度明確排除牌單下載變體，44px 由 `.matrix-card-download-action` 單獨擁有；品牌裝飾 `::before` 與 `::after` 各自設定位置。外層 `.app-screen` 背景僅由 `src/prototype.css` 擁有，移除 `src/styles.css` 的舊白底。品牌背景、選取狀態、安全區與鍵盤避讓沿用現有行為。

2026-09-14：依使用者確認的細金框示意圖，共用底部導覽改為滿寬單一 1px 金線上緣，四個等寬入口依序為首頁、快捷、計算機、我的。主體維持 70px，下方接瀏覽器安全區；內距左右各至少 8px、上下各 6px、項目間距 4px。圖示 24px、文字 12px、圖文距離 4px；選中項使用 1px 細金框、8px 圓角、淡金底、亮金文字與 `aria-current`。移除元件中的 PD01 階梯框與拱框引用，保留素材檔不修改。`src/prototype.css` 是唯一樣式來源，沿用 180ms 色彩轉換與 reduced motion。

首頁快捷設定移到 Logo 卡右上角，使用 22px 金色齒輪、44px 觸控區，保留 800ms 內雙擊、鍵盤、權限及設定流程。首頁框線由 `--home-frame-gold: #d6b66f`、`--home-frame-muted: #8a713f`、`--home-frame-radius: 8px` 統一；未選中導覽圖示與文字均為 `#c3beb6`，選中文字沿用 `#ffe2a0`。

2026-09-12：Matrix 探索、天衡、天衍、天工在「探索設定」標題同列右側共用文字分段切換，依探索、天衡、天衍、天工排列。`MatrixPageSwitcher` 保留完整 accessible name、`aria-current` 與既有導覽回呼；當前頁以金字、淡金底及粗體標示。單一 1px 金褐色外框、8px 圓角、26px 高、176px 可收縮寬度，由 `src/feature-pages.css` 擁有全部切換樣式；移除 `src/matrix-explore-spacing.css` 舊圖片入口的覆寫。探索頁期數與版路欄位恢復使用共用 `SettingLabelIcon`，圖片為 `/assets/matrix-explore/period.png` 與 `/assets/matrix-explore/road.png`，維持 1.8rem 佔位。

首頁由品牌、彩種切換、最新開獎、下次開獎、Matrix 狀態、Matrix Core、功能入口與底部導覽組成，詳見 `docs/COMPONENT_MAP.md`。Matrix Core 與四大功能入口保持分離。表格、歷史卡與彩球不因文件化而改變密度、順序或響應式幾何。

2026-09-22 首頁垂直間距改為響應式範圍：Logo 到公告 5–8px、公告到彩種四卡 6–8px、彩種四卡到開獎資訊卡 4–7px、開獎資訊卡到 Matrix 狀態 7–10px、狀態到 Matrix Core 7–10px、Matrix Core 到四大功能 7–10px。沿用既有 canonical gap variables 直接修改，不新增覆寫；首頁免費聲明自首頁流程、元件與樣式移除。

2026-09-23 首頁跑馬燈沿用既有 `.home-announcement-text` 單一樣式 owner：`Noto Sans TC`／system-ui、11px、600、`--home-frame-gold`（#d6b66f）、字距 `.02em`；原新會員公告保留。彩種更新只取最近正式開獎日中 `result_status=confirmed`，且同一期 `analysisComplete=true`、`matrixStatusComplete=true` 的彩種，不以前一日資料補位；固定文案為「【 彩種 】最新一期開獎資料、Matrix 分析結果已更新。」。`【`／`】` 與彩種文字的視覺間距由 `.home-announcement-lottery-name` 唯一設定 `margin-inline: 1px`；不以一般空白字元模擬。跑馬燈改為每段獨立播放：新會員文案跑完後才切換下一段彩種更新，最後一段完成後回到第一段；各段以相同每秒移動距離播放，時長依當下公告可視寬度加該段實際內容寬度計算，不再固定 18s。track 保留禁止 flex shrink、既有起點 `--home-content-width` 與終點 `-100%`；非同步彩種清單更新時重建並從第一段重新開始。跑馬燈高度、文案、資料條件與互動不變，不新增覆寫。

2026-09-23 首頁資料刷新收斂為單一 coordinator：首頁首次進入仍讀取一次目前資料；之後僅在台北時間天天樂 09:30–13:00、今彩539／大樂透／六合彩 20:30–隔日 01:00 的視窗內保留 10 分鐘 fallback。`/api/matrix/latest-result?cycleDate=YYYY-MM-DD` 以既有 `matrix_watchdog_draw_days` 判定該日實際開獎彩種，包含六合彩日曆／人工 override；已知無開獎日不持續輪詢。快速結果 `preliminary` 只允許更新最新開獎顯示，不可標記完成；只有 `confirmed` 且同一期 `analysisComplete=true`、`matrixStatusComplete=true`，首頁狀態摘要也讀取成功，且目前顯示中的開獎卡已取得同開獎日 confirmed 資料後，才停止該期剩餘 fallback。資料 revision 事件可解除該期完成鎖並立即重讀一次，以承接正式更正；一般回前景／恢復連線不會讓已完成週期重新空轉。首頁不再各自維護跑馬燈、最新開獎卡、狀態卡三套 hourly timer／visibility／online／revision 監聽。

2026-09-14 首頁 Logo、彩種切換、Matrix Core 與四大功能外框統一為 1px 細金線、8px 圓角，直接修改既有樣式來源，不新增疊框、遮罩或覆寫層。Logo、Core 與功能列對齊 16px 左右邊界；Core 維持 654:181 比例、功能列上方間距沿用後續響應式規格。四張卡單列等寬、間距 6px，高度由 90px 降到 76px，圖片在剩餘空間以 contain 等比例顯示，名稱字級不變。功能列本身保持 0 內距、0 外框。`src/homepage/base.css` 擁有 Core 與功能卡，`logo-spacing.css` 擁有 Logo，`lottery-switcher.css` 單獨擁有彩種切換；移除舊九宮格金框及彩種切角多色描邊。彩種選中項以圖片亮度區分（詳見下方三層金框規格），維持原有 radio 操作與 sprite。所有圖片檔不變；啟動／聚合／共振卡的霓虹邊框已嵌入原圖，本輪保留原圖，不加金色覆蓋層。四大功能仍依序為 Matrix 同星、Matrix 對照、Matrix 牌單、Matrix 指南；Core 說明與箭頭為真實 UI。


2026-09-15 首頁三層金框與彩種亮度：開獎資訊卡（含底部兩格時間）與 Matrix Core 使用 1px 明亮金框 `--home-frame-bright: #f0d58c`；四個 Matrix 狀態與四大功能皆使用 1px 標準金框 `--home-frame-gold: #d6b66f`，並由 8px 圓角搭配 1px inset 描邊呈現；彩種改依下述選取狀態使用標準金色透明框。框色由 `src/design-tokens.css` 唯一提供，`base.css` 與 `lottery-switcher.css` 的原有元件規則直接取用。Logo 與主次金框保留；彩種 Selector 及底部導覽依下述更新規格。

共用彩種 Selector（首頁、Matrix 狀態與自訂狀態）由 `lottery-switcher.css` 單獨擁有：四格間距 8px，原流動高度減 10px，390px 畫布由 50px 縮為 40px，最窄畫面保留 36px 點擊高度（本次緊湊 Selector 例外）。使用既有四個獨立 Logo，SVG viewBox 依原檔 alpha 邊界排除透明留白；不改圖檔、不加補償位移。移除含背景與內建框線的 Matrixbba sprite 渲染。未選中：標準金框透明度 22%、內容透明度 60%、應用主背景；選中：框 45%、內容 100%、6% 淡金底。原有 1px 框、8px 圓角不變；180ms 過渡只改框、底色、內容透明度與按壓亮度，無發光。reduced-motion 由 `base.css` 既有區段停用。按鈕維持 radio 語意，單一 Tab 入口，方向鍵循環選中並移動焦點，Home／End 跳到首尾。


Matrix 探索、天衡、天衍、天工與狀態頁的驗證過程，依鎖定條件整組交替使用 `#152A42`、`#0E1D30`。探索、天衡、天衍與天工的左、中、右三欄共用同組底色，欄間與列間間距統一透出純黑 `#000`；狀態頁維持既有頁面背景。既有結果的期號、特別號與欄寬依產生該結果的彩種呈現，探索設定尚未提交時不改變結果版面。版路摘要的公式序列以獨立文字節點呈現，加減版路例如 `+5`、`.`、`15`，合值序列為 `合值`、`5`、`.`、`15`（不顯示 `+`）；相鄰文字節點間距皆為 1px。

Matrix 探索、天衡、天樞、天衍、天工的驗證過程，四彩種的歷史驗證組固定由上往下依時間「舊 → 新」排列；目前來源／本期預測組維持在歷史組之後。只調整驗證呈現順序，不改變演算法計算、連準、公式、預測結果或儲存資料。

2026-09-08：首頁 Logo 以當前尺寸等比例放大 5%，百分比寬度僅由 `src/homepage/logo-spacing.css` 擁有，高度沿用自動比例；移除 base 中重複的尺寸宣告。2026-09-24 間距更新：`src/homepage/base.css` 的 `--home-gap-draw-status`（開獎資訊卡至狀態）與 `--home-gap-status-core`（狀態至 Matrix Core）隨視窗高度限制在 4–7px；Matrix Core 至四大功能的 `--home-gap-core-features` 獨立保留原有 7–10px；移除狀態容器底部額外 1.5px 留白，使外框間距直接由此變數控制。首頁兩列依內容高度由上排列，移除會把剩餘高度撐在狀態卡與 Core 之間的 1fr；底部導覽仍維持固定。不得新增覆寫或固定 Logo 高度。

### 首頁固定 Logo — 2026-09-09

首頁 Logo 固定於內容捲動區上方，沿用正式 MatrixLogo 素材、自動比例高度與 390px 內容寬度上限；Logo 框寬為內容寬減去左右各 16px，圖片填滿框內寬度。`src/homepage/base.css` 擁有首頁固定品牌列與下方捲動區的排列；`src/homepage/logo-spacing.css` 統一擁有品牌列與 Logo 的幾何樣式，品牌列保留自然高度，卡片不會滑入其後方。底部導覽與其他頁面的 Logo 行為維持既有設定。

2026-09-14：依使用者確認的第一輪修正，首頁容器以 `inset: 0` 填滿畫布，頂部安全區只由 `padding-top: var(--layout-safe-area-top)` 避讓一次。品牌列使用 8px 頂部內距與自然高度，移除 Logo 負位移及品牌列扣減高度公式；圖片以真實尺寸 2154 × 634 預留比例，避免下載前後版面跳動。下方原生捲動區接在品牌列之後，保留既有卡片間距。

### Home Mark Six numbers — 2026-09-06

首頁六合彩採使用者確認的 A 方案：保留彩球素材與尺寸，數字由 15px 縮小 10% 至 13.5px，字重由 900 降至 800，沿用白色區域的中心定位與既有光學微調。`src/number-ball.css` 是此首頁變體的唯一樣式來源；既有 Roboto 800 字型檔以首頁六合彩專用字型名稱載入，避免改變其他介面原有的字重匹配。歷史頁、其他彩種與彩球間距不在此次修改範圍。

### Home Mark Six ball spacing — 2026-09-19

首頁六合彩開獎資訊卡六顆正碼的水平間距由 3px 改為使用者選定的 6px。`src/homepage/base.css` 的六合彩卡片變體擁有 `--draw-main-ball-gap`，原有 `.main-balls` 間距規則取用此值；大樂透保留 3px。彩球尺寸仍由 `src/number-ball.css` 擁有；2026-09-20 依使用者要求，六顆正碼改與特別號共用 `clamp(33.7px, 9.88vw, 38.2px)`，直接調整原有尺寸規則的適用範圍。數字維持 13.5px、正碼間距維持 6px，特別號分隔線間距、其他彩種與歷史介面維持原樣。

### Home five-ball numbers — 2026-09-10

依使用者要求，首頁開獎資訊卡的今彩539、天天樂數字由 700 加粗至 800。`src/number-ball.css` 擁有此首頁彩種變體，共用既有 `Roboto Mark Six Home` 的 Roboto 800 字型檔；保留原有 20px 字級、彩球大小、位置、間距與無底線樣式。六合彩、大樂透及歷史介面維持既有字重。

### Profile membership cards — approved A+B

「我的」頁的 A+B 會員／訂閱卡維持 approved A+B 主視覺；下方會員相關、推廣相關、法律資訊、系統相關、客服與支援五組功能卡，統一由 `src/feature-pages.css` 的 `.profile-screen .profile-menu` 使用 `--pwa-control-surface` 平面深色背景與 `--pwa-frame-tertiary` 較低層級外框。功能卡標題金條與 Chevron 僅將 opacity 分別降為 `.78` 與 `.72`，原有尺寸、漸層、顏色與位置不變。功能、文字、排列、8px 區段間距、資料與導覽保持原樣；Header、Bottom Navigation、A+B 素材與幾何及其他頁面的 panel 均維持既有規則。

「我的」頁的會員資料卡與目前訂閱狀態卡採已確認的 A+B 參考：切角雙金框、低透明度 M、資訊分區與金色方案／日期。`src/feature-pages.css` 是兩張卡片的特定樣式唯一來源；裝飾素材位於 `public/assets/lottery/membership/`，框線以 border-image 適配內容高度。沿用既有 16px 頁面留白；兩張卡片置於同一個圓角深色底座，卡片盒模型間距固定為 1px，搭配框圖內緣形成參考圖的可見間距，後續一般區段仍維持 8px。資料繫結與導覽不變。LINE 暱稱保持資訊文字；登入／登出與訂閱入口保留至少 44px 觸控高度，視覺框線可在觸控區內縮。320–430px 使用流動版面，窄螢幕允許說明換行，長暱稱沿用既有縮字與省略策略。

2026-09-20：訂閱資訊雙欄與下方入口改用正常排版，說明下方保留至少 8px 間距再呈現按鈕；卡片高度依文字內容決定。既有 SVG 上下分片維持比例，中段直線框隨內容延伸。依後續要求，付費方案說明縮為「Matrix Pro 權限」並維持單行；此規則取代先前允許方案說明換行的設定。免費會員仍顯示「核心功能體驗」，字級、方案及到期日資料邏輯不變。

### Member detail card backgrounds — 2026-09-25

訂閱方案與收費標準的月／季／年方案卡共用低對比淡金斜紋，僅在右側及右下逐漸呈現，價格、天數、權限文字與既有功能圖示保持清楚；管理訂閱／續訂方案卡不套用。關於樂彩 Matrix 卡片右下及「我的推薦碼＋推薦成功人數」摘要區使用淡 M 輪廓，向正文方向淡出；推薦碼輸入、啟動碼與規則區不套用。背景由 `src/feature-pages.css` 的局部偽元素單獨擁有，金色沿用 `--pwa-frame-secondary`，斜紋／M 的 opacity 分別為 `.07`／`.06`。M 維持等比例並受容器尺寸限制；裝飾不參與排版、不攔截點擊，不新增圖片、文字、Logo、外框、光暈或動畫。A+B 主視覺、Header、Bottom Navigation、現有卡片尺寸、文字、按鈕、資料及所有流程不變。

### Legal information pages — approved complete layout

「服務內容與使用說明」「會員服務條例」「隱私權政策」「退款規範」「聲明與免責事項」共用 `LegalInfoDocument` 與 `LegalInfoSection`，各頁使用一個金框容器，頂端顯示頁名，章節之間以細分隔線區分。`src/feature-pages.css` 的 `.legal-info-*` 是唯一樣式來源，取代原 `.service-info-document` 規則；其他資訊頁的 `DetailCard` 維持原狀。

沿用 16px 頁面留白、12px 容器內距，分隔線為 1px 金褐色 `#8a6d3b`，上下各 12px；頁名 18px、章節標題 15px、正文 13px／1.65 行高、段距 8px。Matrix Core 的探索／天衡／天衍／天工以無圓點子清單縮排，功能項目間距為 4px；彩種採兩欄兩列，訂閱方案每個方案以完整一行靠左呈現，方案之間沿用 6px 行距。郵件連結使用與標題相同的暖金色並保留底線。原文、價格、天數、章節及閱讀順序不變，窄螢幕允許換行，容器隨內容增加高度。

### Contact support and referral layout — 2026-09-06

聯絡客服、問題回報、商務合作維持三張卡片，標題保留金色與 15px；信箱使用 14px 淺灰白 `#c9c2b8` 及底線，hover 使用 `#f1ece3`，與標題金色區分。三張卡片的信箱前顯示「信箱：」，標籤在連結外、不加底線，只有信箱地址保留底線。標籤與連結使用兩欄排列，標籤保持完整，長信箱在右欄換行。2026-09-14 依使用者要求，客服、問題回報、商務合作及退款申請的聯絡信箱統一為 `matrix.lottery@gmail.com`；「聯絡客服」卡片顯示客服電話 `0912-403-517`，使用 `tel:0912403517` 撥號連結，信箱與電話共用既有 `.contact-support-row`，不新增樣式覆寫；`src/feature-pages.css` 擁有此頁聯絡資訊樣式。

推薦成功人數在「我的推薦碼」同列靠右。推薦碼標籤獨立一行，下行使用完整推薦碼與右側複製按鈕；窄螢幕允許長碼換行，不截斷內容。三個推薦說明標題左側與輸入框對齊，啟動碼使用說明保留原縮排。「確認」字級為 16px，按鈕沿用 34px 高度；推薦摘要與排列由 `src/feature-pages.css` 擁有，精簡控制尺寸由 `src/activation-code-layout.css` 擁有。資料、文字、登入狀態、確認、複製與展開流程維持原邏輯。

2026-09-20 推薦規則：沿用黑金外框與原文字級，四項獎勵以人數在上、功能與開放時間在下的清單呈現，窄版允許自然換行。永久開放旁保留人數門檻說明，退款／刷退／交易取消的處理集中在補充規則。推薦區以 `src/feature-pages.css` 的局部變數縮減內文留白與清單縮排，箭頭收合朝下、展開朝上；獎勵列由 `src/activation-code-layout.css` 擁有。啟動碼區既有縮排、箭頭與所有推薦權限及提交流程不變。

2026-09-20 追加調整：移除獎勵清單上方獨立的「Matrix 探索」，各筆功能改為「Matrix 探索 七期」或「Matrix 探索 完整範圍」。推薦規則與啟動碼使用說明的標題按鈕下方，內容頂部留白統一為 8px；維持原有左右縮排、底部留白與自然換行。

### Forms and overlays

2026-09-08 依使用者截圖縮減註冊引導與自訂條件介面：註冊引導使用共用 AppDialog 的 `registration-guide` 變體，寬 268px、28px 圖示與 15px 標題同列、12px 靠左正文；按鈕保留 44px 觸控高度。共用彈窗焦點使用該語意色的 1px 細框，取代白色粗框。自訂條件依後續要求改為彩種下方單列「探索期數：十三期 | 探索範圍：完整範圍」，兩側等寬讓分隔符固定於中央；預設／自訂狀態移至一碼條件標題右側；版路複選沿用 `.segmented-static` 金色選取樣式，原生 checkbox 覆蓋整格且保留鍵盤操作。後續整體整理採收合群組：區段標題14px/600、群組名稱13px/600暖白、摘要11px/400灰白；欄位標籤12px/400，值13px/500，欄位及版路按鍵30px、列距6px。群組收合標題最少52px，內容左右10px；新增條件28px、新增群組30px、儲存與重置34px；底部操作列以共用導覽清除高度加8px留距，避免遮住操作；取消卡內新增按鍵的虛線框，範圍端點直接並排，重複摘要與端點標籤僅保留供輔助技術讀取。原有條件、文案、儲存與重置流程不變。



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


## Matrix 筆記本 — 2026-09-20

筆記本只提供列表與筆記編輯。`src/feature-pages.css` 是唯一版面樣式來源；新增、刪除靠左，兩按鈕間距 4px；同列右側為數字分頁，每頁 10 筆，不顯示總筆數。僅超過 10 筆時顯示分頁列，只有一頁時隱藏。頁碼沿用牌單 `.lottery-tabs` 的透明底、金色選中底線與文字樣式；頁數增加時僅頁碼區橫向捲動。筆記列表與分頁共用 `notebook-sheet` 背景，以既有筆記本素材及漸淡遮罩呈現靜態虛影，背景不攔截操作。按鈕字級 11px、最小高度 34px，新增顯示「新增」且保留「新增筆記」無障礙名稱，刪除保留暗紅色及取消刪除寬度。沿用左右 16px、工具列下方 8px、摘要上下 5px與原有編輯頁。新增儲存成功回第一頁；編輯保留所在頁；刪除導致末頁消失時回到有效末頁。儲存、刪除確認及帳號隔離維持原樣。



### Core lottery tabs and integrated settings — 2026-09-12

四個核心頁面與牌單共用同一個 `LotteryTabs` 樣式，置於標題卡下方 8px，四彩種等寬、36px 高、14px 文字，選中項目使用金字與文字等寬的 2px 金色底線，列下方間距 8px；支援左右方向鍵與 Home／End。彩種切換沿用原有 state setter／changeLottery，不另增 API 或變更查詢規則。移除設定卡內彩種 select。探索、天衡與天衍的命中按鈕、進階設定歸入各自設定卡，不顯示獨立命中條件卡；天工沿用既有兩段設定。設定區一般 segmented 選項與條件按鈕皆為 20px，文字字級不變。背景皆為靜態圖像，不加入動畫。

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

### 樣式來源整理 — 2026-09-14

`feature-page-adjustments.css` 單獨擁有通知頁的最終 8px 內容間距、29px 批次按鈕、600 標題字重與時間選單。`matrix-explore-spacing.css` 單獨擁有結果卡 13px 外距公式及 100% 寬度；responsive 樣式只經此檔的既有 import 載入一次。移除四個只負責後置覆寫的樣式檔，完整清單與尺寸驗證見 `docs/qa/css-cleanup.md`。

會員卡的 1563×1006 素材由既有 SVG 分片顯示；430px 畫布上，素材容器寬 418px，圖內左右框線對齊其他 398px 卡片。`feature-pages.css` 的 `.membership-card-stack` 保留既有 `calc(100% + 20px)` 與 `-10px` 素材幾何，並作為唯一來源，不在 JSX 或另一 CSS 再補償。首頁狀態卡外觀與共用間距由 `homepage/base.css` 擁有。



2026-09-15 首頁四彩種狀態卡：`src/homepage/base.css` 單獨繪製與首頁一致的 1px 細金框（`--home-frame-gold`）與 8px 圓角（`--home-frame-radius`）。原狀態 PNG 的文字、中央光環與彩種 Logo 保留；圖片飽和度為 87%，背景圖亮度 92%、次要彩種 Logo 亮度 85%，由既有圖片規則控制；僅裁去圖片邊緣內建的彩色框，不縮放、不位移、不改圖檔。移除舊切角及按狀態變色的外光暈；載入與失敗使用同一金框，按下沿用首頁亮度回饋。四張卡統一 1.9 寬高比，圖片以 contain 填入，避免不同狀態原圖比例造成兩列高度差；排列、間距與資料邏輯不變。

首頁四彩種狀態卡依使用者最新要求，水平與垂直卡片間距統一為 4px，由 `src/homepage/base.css` 的既有 `.matrix-status-card-grid` 單獨控制；維持 1px 細金框、8px 圓角與兩欄兩列。

### 底部導覽選取樣式 — 2026-09-15

`prototype.css` 為唯一樣式來源：高度 70px 加 safe-area、`--bottom-nav-panel-900` 深藍底、14% 標準金的 1px 上分隔線。選中圖示與文字共用 `--bottom-nav-gold`，100% 透明度、12×2px 指示線；未選中灰白 `--bottom-nav-text-default`，70% 透明度。移除選中大框與底色；圖示維持 Lucide 24px、strokeWidth 1.6。180ms 顏色與透明度切換，reduced-motion 停用；四個路由與快捷開啟方式不變。

### Matrix 演算法頁面資訊顏色 — 2026-09-15

同碼開啟時，不同結果號碼組別之間使用 1px、72% 標準金的組間分隔線；組內一般列線維持 28%。由 `src/matrix-explore-spacing.css` 的既有 `article[data-number-group-start="true"]` 規則單獨擁有，四彩種與四種演算法共用，不新增覆寫層。

探索、天衡、天衍、天工共用 `.matrix-explore-main-screen` 的頁面色彩變體，四彩種一致套用。`src/matrix-explore-spacing.css` 在既有根節點設定細框線 `--pwa-frame-divider` 為標準金的 28%，摘要分隔符 `--explore-validation-summary-border-color` 使用摘要外框的 `--pwa-frame-secondary`。`src/explore-result-preview.css` 的既有分隔符規則同時處理兩種摘要分隔符類別；其他頁面保留原分隔符預設色。重複號碼統計小卡的次數使用暖灰白 `#c6c0b8`，移除原 72% 透明度，沿用字級、字重、尺寸與篩選操作。

2026-09-21：筆記編輯頁外框自動延伸至底部導覽列上方，內容輸入框同步自動撐高；原有標題、返回、按鈕、左右間距與功能不變。

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
already inherited. Generic CTAs keep the thin shared frame. `.branded-explore-action` is the intentional legacy branded CTA variant used by Matrix Explore/Tianheng/Tianyan/Tiangong, Matrix Card download and Pro payment; it retains the darker gold metallic surface, 1px `#c99a2e` frame, 9px radius, .78 sparkle layer and lower-edge energy line. Matrix Explore/Tianheng/Tianyan/Tiangong and Matrix Card also share the approved borderless lottery selector with a selected gold underline.

These rules supersede older non-home frame colors, corner radii and ornamental
gold-glow descriptions only. Existing geometry, accessibility focus indicators,
semantic error/success colors, number marks, lottery balls, embedded membership
artwork, homepage animation and approved homepage spacing remain unchanged.
Intentional borderless inner wrappers do not gain a second frame. No route,
component behavior, copy, API or worker changes are included.

Verification: `tests/pwa-frame-system.test.mjs` and
`tests/pwa-frame-system.spec.ts` (real production router, isolated test responses).

## Matrix 天樞 — 2026-09-19

Matrix 天樞加入核心頁面切換列，順序為探索、天衡、天樞、天衍、天工。切換列仍由 `.matrix-page-switcher` 單獨擁有 176px × 26px 外框、五個等寬文字按鈕、同一字級與選取狀態；標題列仍為 68px。天樞沿用天衡的 `MatrixExplorePage`、設定卡、按鈕、選項、間距、結果列、驗證卡、06 流動背景及所有既有樣式，沒有新增頁面專用 CSS 或素材。

天樞與天衡唯一的資料呈現差異是第三組來源鎖定號碼與位置。結果列在既有鎖定欄追加第三行；驗證摘要第一列維持三個直接 `span` 子節點，第三個節點在天衡兩組來源文字後追加「、跟 第三號碼 第N顆」。兩列繼續使用 `ExploreValidationSummary` 的既有自動字級適配，首列保留連準標籤預算。天衡仍只顯示兩組鎖定資料。

使用者選擇窄螢幕方案 A：天衡與天樞五碼驗證列在空間不足時縮小號碼間距及左右留白，保留原字級、號碼框與卡片尺寸。`src/explore-result-preview.css` 的共用 `.tianheng-validation-process` 提供間距預算，寬螢幕沿用原間距。使用者追加確認七碼列可縮窄公式欄，將空間分配給號碼欄，保留整張卡片大小與字級。七碼軌道最少容納號碼本身及鎖定／參照框，特別號及公式間距依可用寬度收緊；公式欄隨畫面恢復至原 112px 上限。天衡與天樞共用這些變數，其他演算法沿用既有預設。



### 2026-09-19：訂閱、指南與我的文案一致性

三種方案與指南 Pro 章節由 `src/matrix-pro-copy.ts` 共用權限文案；探索、天衡、天樞均以「十三期、完整範圍」呈現。指南補既有天樞功能與 Google 登入，會員相關頁面統一說明目前採手動轉帳且自動續訂尚未開放。未變更功能權限、會員流程或法律權利條款。

方案幾何繼續由 `src/pro-plans-layout.css` 管理；移除 `feature-pages.css` 中已被覆寫的方案卡片尺寸與文字間距宣告，保留實際生效的尺寸、auto 高度及原有響應式結構。逐頁核對與驗證限制記錄於 `docs/qa/2026-09-19-subscription-guide-profile-copy.md`。


2026-09-20：依使用者確認完整移除自訂觸發狀態。一般 Matrix 狀態頁保留彩種、狀態與版路驗證呈現，移除頁首自訂條件入口及其專用頁面、樣式與背景。首頁快捷設定不受影響。

### 綠界審核登入 — 2026-09-20

「我的」頁沿用既有黑金會員卡、LINE／Google 上下排列；啟用審核入口時，在 LINE 左側新增「綠界」。原本登入區域的 grid 依顯示開關增加一欄，不新增補償位移。帳密表單使用既有 Radix Dialog 與 `src/dialog/app-dialog.css` 表面、按鈕、焦點及 viewport 限制；密碼不顯示明文。

### 歷史開獎五球彩種可讀性 — 2026-09-21

歷史開獎頁的今彩539與天天樂維持既有曆週分卡、期數與「期數｜日期｜開獎號碼」三欄結構；`src/draw-history-readability.css` 只負責這兩個五球彩種的歷史頁可讀性，資料列維持 59px，五球間距調整為 `clamp(5px, 2vw, 8px)`；表頭底線、資料列底線與前兩欄直向分隔線分別提高至 `rgba(212, 169, 83, .48/.36/.32)`，只加強既有分隔線辨識度，不新增結構。`src/number-ball.css` 的歷史頁五球尺寸仍為 `clamp(23px, 6.8vw, 26px)`、號碼字級仍為 `clamp(12px, 3.4vw, 13.5px)`。Matrix Explore、大樂透與六合彩維持既有尺寸與間距；資料、排序、日期、篩選、API 與互動不變。

### 大樂透歷史彩球小幅放大 — 2026-09-22

歷史開獎頁的大樂透主號與特別號共用 `--matrix-history-ball-size`，由 `clamp(20px, 6.15vw, 24px)` 小幅調整為 `clamp(21px, 6.4vw, 25px)`。只調整大樂透歷史頁彩球尺寸；球間距、列高、字級、特別號標籤位置、資料與功能流程不變，今彩539、天天樂、六合彩與 Matrix Explore 不動。
