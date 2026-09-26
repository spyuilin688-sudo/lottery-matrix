# 2026-09-26 未使用檔案大範圍排查

## 範圍與依據

- 基準：`ffbc829b422857062698ab1db261b485cc2da34e`，儲存庫 `spyuilin688-sudo/lottery-matrix`。
- 盤點 1,898 個 Git 追蹤檔案（約 105.78 MB）、10 個 GitHub Actions workflow、29 個遠端分支。
- 檢查 PWA、管理後台、根目錄共用 backend、16 個 Supabase Edge Function 入口、276 份 SQL migration、58 個 Python app 模組、scripts、靜態資源及依賴清單。
- 從 PWA、admin、Edge Functions、Cloudflare Function、Sites Worker 等 20 個入口建立保守引用圖，並人工核對未達候選、測試用途與動態資源路徑。引用圖只是候選篩選，不能單独證明可刪除。
- 已取得另一个私有儲存庫 `lottery-matrix-app` 的 README；未取得其完整部署及呼叫關係，不將它判定為廢棄專案。

## 清理結果

刪除 25 個檔案，共 20,466,175 bytes（20.47 MB，以十進位計）。其中 20 張舊圖共 20,443,733 bytes；另有 3 支一次性改寫腳本與 2 個未匯入的前端元件。

| 類別 | 證據 |
| --- | --- |
| 舊通知 PNG | 正式 `NotificationsPagePatched.tsx` 明確使用 `/resources/notify-*.png`；未找到 `/assets/notifications/` 呼叫或動態拼接。 |
| 舊首頁／狀態／天工／筆記本圖片 | 檢查正式 JSX、CSS、模板字串及建置腳本；部分既有測試明確排除舊圖；不存在實際引用。 |
| 舊 header SVG | 正式 BrandHeader 使用現行 `headers/*.webp`；刪除的四個 SVG 無來源引用。 |
| 三支 CSS 改寫腳本 | package scripts、CI、原始碼、文件均無呼叫；腳本依賴的舊 CSS 區塊標記已不存在，屬一次性改稿工具。 |
| `BrandLogo.tsx` | 沒有正式匯入；兩個測試僅讀取檔案但沒有使用讀取結果，一併移除這兩行無效讀取。所有測試斷言保留。 |
| `subscription-copy.tsx` | `SubscriptionCopy` 沒有正式匯入或呼叫，現行訂閱頁不依賴此包裝元件。 |

### 刪除明細

| 路徑 | Bytes |
| --- | ---: |
| `src/BrandLogo.tsx` | 368 |
| `src/subscription-copy.tsx` | 373 |
| `scripts/tmp-explore-reference-final.py` | 4360 |
| `scripts/tmp_matrix_explore_finalize.py` | 4458 |
| `scripts/normalize_matrix_explore_canonical.py` | 12883 |
| `public/assets/notifications/bet.png` | 2052040 |
| `public/assets/notifications/card.png` | 2029540 |
| `public/assets/notifications/collision.png` | 1641946 |
| `public/assets/notifications/expiry.png` | 2117380 |
| `public/assets/notifications/result.png` | 2122324 |
| `public/assets/notifications/status.png` | 1775375 |
| `public/assets/notifications/system.png` | 2141292 |
| `public/assets/notifications/win.png` | 2050544 |
| `public/assets/lottery/functions/HomeLogo.svg` | 213 |
| `public/assets/lottery/functions/matrixWW1.png` | 469100 |
| `public/assets/lottery/functions/matrixcore.png` | 1181360 |
| `public/assets/lottery/functions/命中條件.png` | 2030229 |
| `public/assets/lottery/header-06-flow.svg` | 1605 |
| `public/assets/lottery/header-07-geometric.svg` | 1212 |
| `public/assets/lottery/header-explore-luxury-flow.svg` | 14828 |
| `public/assets/lottery/header-explore-planet.svg` | 6481 |
| `public/assets/lottery/status/Matrixbba.png` | 348691 |
| `public/assets/lottery/status/matrixAA.png` | 285861 |
| `public/assets/quick/notebook-mode-note.png` | 92415 |
| `public/assets/quick/notebook-mode-record.png` | 81297 |

## 保留項目及原因

| 類別 | 處理依據 |
| --- | --- |
| 根目錄 backend 與 admin backend | 正式 Edge Functions/PWA 仍引用共用模組；其餘演算法／reader／tracker 模組有測試、比對或歷史用途，未以未達正式入口直接判定無用。 |
| Python Worker／手動指令 | `card_worker` 是手動修補入口，其他 worker 被服務命令、workflow、recovery 或測試使用；單純沒有 Python 模組匯入不代表無用途。 |
| `src/auth/provider-identity.ts` | 仍由 `provider-login-identity.test.ts` 使用；不刪除既有測試或登入相關測試素材。 |
| `public/assets/matrix-explore/*.png` | `SettingLabelIcon` 以模板路徑載入，完整檔名零命中是假象。 |
| 重複圖片 | 有些相同內容分別供正式頁面與測試使用，或仍屬素材清單；不按雜湊批次刪除。 |
| `gold-frame.webp` 與具保留要求的素材 | `docs/ASSET_MANIFEST.md` 明確紀錄保留原圖要求，維持保留。 |
| 所有 SQL migrations | 保留重建、版本順序及歷史資料契約；未修改正式資料庫。 |
| GitHub 工作流程及分支 | 備援、手動驗證與現行 CI 仍有用途。`home-logo-core-check.yml` 僅匹配特定工作分支，目前 29 分支無匹配；這只能證明目前沒有匹配分支，不能證明應永久刪除。未刪分支或改觸發規則。 |
| 套件與部署設定 | 正式來源／build／測試仍引用，未刪依賴、lockfile、Sites 封裝及 Railway 手動相容設定。 |
| 暫存產物 | 追蹤清單未發現 node_modules、dist、ZIP、bak、log、tmp、pyc、tsbuildinfo 等誤提交產物；檔名含 tmp 的三支 Python 改稿腳本另行核實後刪除。 |

## 驗證

清理前與清理後均執行：

```sh
node --test tests/homepage-logo-layout.test.mjs tests/tiangong-setting-label-icons.test.mjs tests/subscription-copy-assets.test.mjs tests/requested-history-quick-logo.test.mjs tests/responsive-feature-pages-request.test.mjs tests/bottom-navigation.test.mjs tests/home-lottery-cards.test.mjs
npm run build:pages
```

- 兩次限定測試均為 30 項通過，0 失敗。
- 兩次 build 均退出 0，含 Mobile Runtime integrity、TypeScript、PWA 與 admin Vite build。
- 清理前 dist：194 檔，91,973,833 bytes；清理後：174 檔，71,530,100 bytes。
- 20 個缺少的建置檔逐一等於核准刪除的舊圖片；沒有意外新增建置檔。
- 173 個保留建置檔 SHA-256 完全一致，包含所有 PWA/admin JS、CSS、HTML 及保留資源。
- 唯一不同的保留檔是 `push-service-worker.js` 的自動建置指紋。只正規化 `matrix-pwa-shell-<hash>` 與 `matrix-build:<hash>` 後，整個 Worker 內容完全一致。
- `git diff --check` 通過；兩個测试檔仅移除未使用的讀檔變數，没有刪除測試或斷言。
- npm 顯示環境的 `http-proxy` 設定警告，未使建置或測試失敗。

## 驗證界線

本次證明的是目前儲存庫正式建置與保留資源內容一致，不代表正式資料庫、外部服務、舊客戶端或其他儲存庫都不存在歷史資料。未清空會員、啟動碼、訂閱、歷史開獎、演算資料、備份、Git 歷史或遠端分支。已刪公開 URL 的歷史直接連結未做存取日誌驗證；現行儲存庫沒有引用。沒有執行全專案測試或聲稱完成實機端到端驗證。
