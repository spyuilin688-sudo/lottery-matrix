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

搜尋、狀態及筆數共用單列 grid；手機狀態欄 94px、筆數依內容、搜尋可收縮。一般操作 28–32px 高，標題列圖示 40px，按鈕依文字寬度；不強制手機按鈕整列。表單、對話框、通知管理、待辦、系統設定使用相同緊湊節奏。

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

手機通知只縮短說明並保持原有意義；權限、註冊、停用、付款金額及確認／拒絕 API 不因排版而改變。轉帳狀態僅將既有值翻成繁體中文。

## Do / Don't

使用自然高度與可收縮欄位，保留可操作焦點、錯誤及空狀態。不要以固定高度裁切內容、改變權限或把預覽資料帶入正式站。
