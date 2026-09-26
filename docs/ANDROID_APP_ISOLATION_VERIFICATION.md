# Android 免費 App 隔離驗證紀錄

2026-09-26；實作位於兩個工作分支，未修改 main、未部署、未套用正式 migration。

## 變更範圍

App 會員、權限、通知設定、在線紀錄、原生推播、管理後台與收入獨立；共用 Supabase Auth 與唯讀彩種資料。原 PWA 權限與金流保留。App 全功能免費，無購買入口。刪除作業保留 PWA／其他產品的身分依賴，清理失敗以 pending 呈現；刪除後須明確重新加入。

## 已觀察的驗證

- SQL：明確指定 7 個 App 測試檔，共 40 項 PGlite 行為測試通過；涵蓋會員／session、分析授權、設定、推播、復原與刪除。
- 後台：App API／資料庫與相依權限測試 62 項通過；App 分頁及既有後台恢復測試 19 項通過。
- App Edge：新增 status、native dispatch、account delete 的相關測試通過。
- 公開資訊：路由不掛載 PWA 會員流程；登入讀取 rejection 測試由失敗修正為通過（4 項頁面測試）。
- 瀏覽器：後台與公開隱私頁 320/360/390/430px 及 200% 文字測試共 8 項通過，已檢視實際 CJK 截圖。
- PWA 前端、管理後台 build:pages／TypeScript 通過；未以全量測試代替局部驗證。

## 可重跑的隔離驗證

工作分支限定 workflow `.github/workflows/app-isolation-check.yml` 執行明確檔案。真實 PostgreSQL 使用 CI 容器內專用資料庫；runner 只接受 loopback、matrix_app_test 名稱，建立隨機新資料庫並只刪除此自建資料庫。多連線測試涵蓋 bootstrap、PWA 加入對 App 刪除、收入唯一鍵及推播租約。

本機未驗證真實 PostgreSQL：缺少 psql，root initdb 不允許，runuser 無所需權限。不能把 PGlite 結果當作 PostgreSQL 併發證據；須檢查工作分支 CI 結果。

## 發布前仍需的證據

- 隔離 staging 中真實 Supabase Auth／Edge、OAuth redirect 與刪除整合；沒有使用正式會員測試。
- 實機 LINE／Google、FCM、前背景、返回鍵、離線復原與帳號切換。
- 公開隱私／刪除 URL 實際部署、資料保存期限與商店申報。
- Android 版本／正式簽章／Play Console 設定；debug APK 與 unsigned AAB 不能當正式發布包。

## 審查與遠端驗證

獨立程式審查、真實 PostgreSQL CI、APK/AAB 建置結果待記錄。未執行正式部署或 main 合併。
