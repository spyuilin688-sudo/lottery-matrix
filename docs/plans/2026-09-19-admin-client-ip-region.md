# 管理後台登入 IP 與推估地區修正

基準：`spyuilin688-sudo/lottery-matrix` main `4656d0a565d7e97810eca721fcc5c9509a4ebc6a`。

## 已確認的問題

正式登入紀錄頁的 35 筆資料中，9 筆保存的是 Cloudflare Worker 固定地址開頭、AWS 地址結尾的轉送鏈。地區查詢取第一個地址 `2a06:98c0:3600::103`，並使用已有的 `US / Portland` 快取，因而把中轉地址的地區呈現為使用者地區。

Cloudflare 說明：<https://developers.cloudflare.com/fundamentals/reference/http-headers/#cf-connecting-ip-in-worker-subrequests>。

## 修正範圍與行為

- Pages 代理取得入口 `CF-Connecting-IP`，以專用共用金鑰簽署 IP、時間、HTTP 方法、API 路徑／查詢字串及 Origin。
- Supabase adapter 驗證 HMAC-SHA256 及 60 秒時效後，才將 IP 放入專供登入／審計紀錄使用的 `event.clientIp`。
- 代理不採用瀏覽器提交的同名 IP／簽章標頭。沒有有效簽章時，位置資料留空，登入與既有權限判斷照常執行；不退回使用可能已被平台改寫的轉送鏈。
- `event.clientIp` 不寫入 security monitor 的平台 `sourceIp`，既有安全監控與限流規則維持原樣。
- 歷史查詢略過 Cloudflare Worker 固定地址（含等價 IPv6 寫法）及無效 IP；不改選後方 AWS 地址，不採用舊的 Portland 快取。沿用畫面空值 `—`。
- 保留既有歷史紀錄，不推造原始 IP，不改資料表、Cron、演算法、會員驗證流程或畫面配置。
- AppDeploy 相容入口仍沿用其既有平台 IP 來源，並套用相同的地址驗證。

## 部署必要設定

1. 產生一組至少 32 字元的隨機金鑰，在 **Cloudflare Pages production** 與 **Supabase admin-api** 同時設定 `MATRIX_ADMIN_PROXY_SECRET`，兩側值必須相同。只使用伺服器端加密環境設定，不能使用 `VITE_` 前綴、提交金鑰或寫入前端 bundle。
2. 先部署 Supabase `admin-api`，包含新增的 shared 模組及 `deno.json` 映射；再發布 Pages 代理。本次尚未修改正式環境或設定金鑰。
3. 切換期間若缺少簽章／設定，API 保持可登入，但不記錄未驗證的 IP；不要將這種狀態誤認為新 IP 已完成正式驗收。
4. 上線後以一次實際登入核對：入口 IP 與新紀錄一致、地區查詢使用該 IP；舊 9 筆地區顯示 `—`；登入／登出正常。

## 驗證

- 修改前 4 個相關測試檔、18 項測試通過。
- 新增回歸案例先確認失敗：Cloudflare 歷史紀錄錯顯 Portland、代理跨站後失去入口 IP、登入紀錄優先寫入代理地址。
- 測試涵蓋 IPv4／IPv6、Supabase URL 前綴變化、簽章被竄改、簽章過期、跨路徑重用、未簽章直連、缺少金鑰及 Cloudflare 固定地址。
- 正式部署與新登入驗收待上線時執行，不能以本機測試替代。
