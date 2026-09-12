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
| Permission Switches | 權限切換工作區 | src/PermissionSwitches.tsx、src/permission-switches.css | 全角色只讀／超級管理員可修改 | permission-switches、admin-permissions-app |

手機通知使用預設收合的原生 details / summary，一行顯示通知狀態，展開才顯示說明與設定動作；收合不改變裝置註冊。權限、註冊、停用、付款金額及確認／拒絕 API 不因排版而改變。轉帳狀態僅將既有值翻成繁體中文。

「權限切換」沿用緊湊後台工作區，最大寬度 720px。兩個設定各自以標題、影響說明及原生 `role="switch"` 控制組成；所有管理員看到相同伺服器狀態，非超級管理員的控制保持 disabled 並有文字說明。修改使用既有 `ConfirmationDialog`，頁內保留 loading、status、alert 與重試。760px 以下讓文字與控制自然換成單欄，不截斷說明，開關觸控區至少 44px。此功能不新增全域色彩、字型或形狀 token。

權限切換在控制列上方常駐顯示目前 PWA 的「訂閱購買」與「會員免費使用」狀態、最近成功檢查時間及「每小時自動檢查」提示。每 60 分鐘重新讀取同一伺服器端權威設定；背景讀取失敗保留最近成功狀態並顯示錯誤，不猜測或覆蓋值。

## Do / Don't

使用自然高度與可收縮欄位，保留可操作焦點、錯誤及空狀態。不要以固定高度裁切內容、改變權限或把預覽資料帶入正式站。

### 系統設定服務檢查

狀態標籤由 src/system-status.css 的 .statusState .statusBadge 擁有：11px 字級、最小高度 20px、2px／6px 內距與 4px 圓角。藍色表示只確認 API 存在、連線或所屬主機；綠色表示該項檢查／最近執行正常；紅色表示檢查失敗。不得把部分檢查改成已驗證完整功能。

每項服務以獨立邊框分隔，間距 8px。名稱、用途、檢查範圍及錯誤訊息常駐；API 位址、時間、回應代碼及排程明細使用原生 details，預設收合，鍵盤可操作。文案由 src/system-status.ts 與 backend/api-status-inventory.ts 擁有，技術詞改成具體用途，既有功能與操作權限保持一致。

Railway 操作由 src/RailwayOperations.tsx 與 src/system-status.css 擁有，使用既有原生彩種選單、compactButton 與 AdminApp 確認對話框。手動更新與復原沿用管理員 edit 權限，一次選定一個彩種，送出期間鎖定操作，失敗不自動重送。復原回應 accepted 只顯示已受理，不能描述成已完成；already-running 顯示未重複啟動。操作回饋使用持續可見的 status／alert 區域。

### 代辦、通知與 Railway 操作密度

代辦工作區最大 680px；新增欄位兩行，留言以單一清單的分隔列呈現，桌面操作靠右、窄版移至內容下方。通知工作區最大 960px；卡片共用標題，收件對象與固定內容桌面雙欄、手機單欄；頭像 32px，發送說明與按鈕並列；發送紀錄每頁 5 筆並沿用共用分頁。共用卡片之間 8px，這三個工作區的動作為 28px 高、12px 字級、依內容寬度。

Railway 原生彩種選單固定 104px 寬、28px 高、12px 字級；兩種操作各自一列，常駐用途及適用時機，按鈕靠右。復原說明明列天天樂僅分析、背景受理不等於完成，以及重新檢查與避免重複送出的方式。保留既有確認、權限、狀態回饋與 API 行為。

### 會員資訊視窗

用戶管理與訂閱管理共用 src/UserInfoDialog.tsx；採原生 modal dialog，瀏覽器管理焦點限制與 Escape，關閉後還原觸發按鈕焦點。src/member-info.css 擁有 620px 最大寬度、12px 內距、兩卡 8px 間距、28px 動作與每頁五筆登入紀錄。第一卡四個欄位以 92px 標籤欄對齊；窄版標籤欄 84px、卡片內距 10px，IP 與 ID 可斷行。表格失敗保留重試，切換會員清除先前資料，換頁期間停用動作。用戶列表以狀態欄承載原有停權／啟動操作，不額外增加操作欄。

登入紀錄取自驗證服務的工作階段，重新整理及權杖續期不新增登入。最近連線 IP 代表最近驗證連線；既有工作階段的原始登入 IP 不可還原，顯示尚未記錄。IP 地區由後台 IPWhois HTTPS API 估算，只傳 IP，不傳帳號／名稱／權杖；成功結果快取七日，失敗一小時，每次最多查十個新 IP，服務失效顯示無法判定。會員紀錄隨帳號刪除而移除。會員及訪客不可讀取，後台沿用來源模組的查看權限。

### 訂閱、付款與管理清單

訂閱管理只列出未到期、啟用中且方案天數為 30／90／365 的成功訂閱會員；月費、季費、年費直接排列在同一張表，不切換清單。工具列沿用原生 select，以 104px（窄版 88px）的「全部方案／月費／季費／年費」篩選放在搜尋與筆數之間；表格內「調整到期日」與「用戶資訊」按鈕高 24px、11px 字級。付款紀錄與沖銷使用整張原生 details 卡片，預設收合；summary 顯示標題與筆數，展開後才呈現紀錄與表單。每筆紀錄以明確分隔線區隔；已確認狀態使用金色標籤，並與高 24px、10px 字級的「記錄沖銷」按鈕並排於右側，不建立多餘空白列。

主選單的登入紀錄每頁 10 筆，IP 後緊接推估地區欄；啟動碼管理每頁 10 筆，換頁時清除本頁勾選，避免跨頁誤複製或誤刪。會員資訊視窗內的登入紀錄仍維持既有每頁 5 筆契約。

### 後台 PWA 身分

後台 manifest 的 `id`、`start_url`、`scope` 都固定為 `/admin/`，啟動時註冊 `/admin/admin-push-sw.js` 並限制 scope 為 `/admin/`。管理後台與前台 PWA 保持不同安裝身分及服務工作者範圍。

### 後台啟動畫面（2026-09-12）

以使用者上傳的 1000020659.png 原圖作為唯一全幅啟動圖，正式資產為 public/admin-launch-20260912.png。public/admin-launch-20260912.css 擁有純黑啟動背景與等比例完整顯示；不裁切、不拉伸、不增加裝飾或覆寫既有後台 CSS。public/admin-launch-20260912.js 在圖片顯示至少 1.2 秒且 React 首次呈現後移除畫面；圖片失敗不阻擋已就緒頁面，最長 10 秒釋放。啟動期間後方頁面 inert，結束後解除。PWA、apple-touch 與推播圖示統一為原圖等比例縮放置於黑底方形的 admin-20260912-*，移除舊圖示檔與引用。安裝身分與推播 scope 維持 /admin/。Android 系統原生啟動階段採新版方形圖示；網頁階段顯示完整直式原圖。
