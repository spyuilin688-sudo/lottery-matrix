---
version: alpha
name: 樂彩 Matrix 營運後台
description: 高密度、繁體中文、深色金色資訊管理介面
colors:
  background: '#090b0f'
  surface: '#111419'
  primary: '#e1c170'
  text: '#ece7d8'
---

# 營運後台設計

## Overview

服務手機與桌面的管理員，快速查閱營運資料、會員、訂閱及轉帳。沿用深色金色識別，重點是掃讀與明確操作；不使用行銷式大卡片或滿版操作按鈕。此文件只管理 apps/admin，前台 PWA 仍由根目錄 DESIGN.md 管理。

## Colors

背景 #090b0f、卡片 #111419、邊界 #30333a、重點 #e1c170、正文 #ece7d8。成功與錯誤仍有文字及語意狀態。

## Typography

Inter、Noto Sans TC、system-ui；資料與次要資訊 12–13px，區段標題 15–17px、統計數值 22px。長資料可換行，表格保留橫向捲動查看完整欄位。

## Layout

手機內容左右各 10px，桌面 14px。統計卡最小高度 60px，以內容自然長高。營運概覽前四張為流量／會員、後四張為訂閱；分隔線 1px，兩側垂直間距各 8px（同一 grid 的 row-gap）。手機兩欄、桌面四欄；收入卡保留原有分組。

搜尋、狀態及筆數共用單列 grid；手機狀態欄 92px、筆數至少 64px 並隨位數增長、搜尋主動收縮。一般操作 28–32px 高，標題列圖示 40px，按鈕依文字寬度；不強制手機按鈕整列。表單、對話框、通知管理、待辦、系統設定使用相同緊湊節奏。

## Elevation & Depth

以邊界和低強度陰影區分區塊。對話框沿用既有焦點、確認與遮罩行為。

## Shapes

卡片圓角 10–12px，控制 8px；不新增裝飾性形狀。

## Components

Runtime ownership（Model B）：src/admin.css 擁有基本排版，src/admin-operations.css 擁有共用密度和管理清單，src/system-status.css、src/admin-transfer-push.css、src/admin-todos.css 擁有各自元件。CSS 為來源，本文件是鏡像。

| Capability | Canonical owner | Source of truth | Allowed variants | Verification |
|---|---|---|---|---|
| Select/Listbox | 原生 select | src/AdminApp.tsx、src/NotificationManagement.tsx | OS 原生選單；平台控制開啟後幾何 | 權限與通知元件測試 |
| Date | 原生日期欄位 | src/AdminApp.tsx | OS 原生日期選擇與在地化 | 既有編輯流程 |
| Form | 既有 formGrid / formActions | src/admin-operations.css | 登入按鈕維持整列、管理動作依內容 | admin-profile、admin-confirmation |
| Scrollbar | CSS 原生捲動條 | src/admin.css | 表格水平捲動，頁面自然捲動 | 密度與窄版版面檢查 |

手機通知使用預設收合的原生 details / summary，一行顯示通知狀態，展開才顯示說明與設定動作；收合不改變裝置註冊。權限、註冊、停用、付款金額及確認／拒絕 API 不因排版而改變。轉帳狀態僅將既有值翻成繁體中文。

## Do / Don't

使用自然高度與可收縮欄位，保留可操作焦點、錯誤及空狀態。不要以固定高度裁切內容、改變權限或把預覽資料帶入正式站。

### 系統設定服務檢查

狀態標籤由 src/system-status.css 的 .statusState .statusBadge 擁有：11px 字級、最小高度 20px、2px／6px 內距與 4px 圓角。藍色表示只確認 API 存在、連線或所屬主機；綠色表示該項檢查／最近執行正常；紅色表示檢查失敗。不得把部分檢查改成已驗證完整功能。

每項服務以獨立邊框分隔，間距 8px。名稱、用途、檢查範圍及錯誤訊息常駐；API 位址、時間、回應代碼及排程明細使用原生 details，預設收合，鍵盤可操作。文案由 src/system-status.ts 與 backend/api-status-inventory.ts 擁有，技術詞改成具體用途，既有功能與操作權限保持一致。

Railway 操作由 src/RailwayOperations.tsx 與 src/system-status.css 擁有，使用既有原生彩種選單、compactButton 與 AdminApp 確認對話框。手動更新與復原沿用管理員 edit 權限，一次選定一個彩種，送出期間鎖定操作，失敗不自動重送。復原回應 accepted 只顯示已受理，不能描述成已完成；already-running 顯示未重複啟動。操作回饋使用持續可見的 status／alert 區域。

### 代辦、通知與 Railway 操作密度

代辦工作區最大 680px；新增欄位兩行，留言以單一清單的分隔列呈現，桌面操作靠右、窄版移至內容下方。通知工作區最大 960px；卡片共用標題，收件對象與固定內容桌面雙欄、手機單欄；頭像 32px，發送說明與按鈕並列。共用卡片之間 8px，這三個工作區的動作為 28px 高、12px 字級、依內容寬度。

Railway 原生彩種選單固定 104px 寬、28px 高、12px 字級；兩種操作各自一列，常駐用途及適用時機，按鈕靠右。復原說明明列天天樂僅分析、背景受理不等於完成，以及重新檢查與避免重複送出的方式。保留既有確認、權限、狀態回饋與 API 行為。
