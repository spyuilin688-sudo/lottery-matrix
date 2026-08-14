# 樂彩 Matrix Work 專案交接

## 1. 目前實際專案名稱與路徑

- 產品名稱：`樂彩 Matrix`
- `package.json` 套件名稱：`lottery-matrix-appdeploy-preview`
- 本次唯一打包來源：`/workspace/scratch/dae79cc2c061/lottery-matrix-v26-work`
- ZIP 內專案根目錄：`lottery-matrix-work`
- 技術：React 19、TypeScript、Vite 6
- 目前線上預覽：<https://lottery-matrix-work.spyuilin688.chatgpt.site>

本 ZIP 是從上述 Work 工作區實際專案直接建立。未使用其他 ZIP、舊版備份、空白專案或 AppDeploy 外層空白來源替代。

## 2. 目前最新完成內容

1. 正式 React 入口為 `src/App.tsx`，會載入 `MobileRuntime` 與 `Prototype`，不是空白 App。
2. 首頁與功能頁已使用共用的樂彩 Matrix 頁首 Logo 素材。
3. 全介面底部導覽由單一 `BottomNavigation` 共用元件輸出。
4. 底部導覽固定為：`首頁｜快捷｜通知｜我的`。
5. 底部導覽保留既有 route、Active 判斷及快捷長按 3 秒邏輯。
6. 底部導覽現有樣式包含四欄等寬、六角圖示、金色 Active 狀態、中央品牌節點及 Safe Area 計算。
7. 通知頁的 `Matrix 牌單`、`Matrix 摘星`、`系統通知` 已各自引用目前專案內的實體圖片。
8. 已逐一核對目前原始碼內的 `/assets/...` 與 `/resources/...` 靜態素材引用，所引用檔案均存在於 `public/`。
9. 2026-08-09 已執行正式 Build，TypeScript 與 Vite 均成功。

## 3. 尚未完成內容

- 目前工作區沒有獨立、明確的後續待辦清單；後續修改範圍須以新 Work 對話收到的指令為準。
- 目前實際來源沒有 Web App Manifest，也沒有 Service Worker；不得宣稱這兩項已完成或自行建立替代檔案。

## 4. 最新修改內容

目前實際來源中，最近一組已落入程式的介面修改為：

1. 首頁及功能頁頁首統一引用最新正式 Logo 素材。
2. 底部導覽統一由 `src/BottomNavigation.tsx` 輸出。
3. 底部導覽的黑金面板、六角圖示、Active 狀態、Safe Area 與品牌節點樣式位於 `src/prototype.css`，共用色彩位於 `src/design-tokens.css`。
4. 首頁由 `src/Prototype.tsx` 使用共用底部導覽。
5. 功能頁由 `src/FeaturePages.tsx` 使用共用底部導覽。
6. 通知頁的 `Matrix 牌單`、`Matrix 摘星`、`系統通知` 指向目前 `public/resources/` 內的圖片。

## 5. 共用頁首 Logo 使用的實際素材

- 實際素材：`public/assets/lottery/brand-logo-transparent.png`
- 原始尺寸：`1913 × 383`
- 格式：PNG、RGBA
- SHA-256：`6f992dfc7de9f4f693f08007a54c7e4371bab77023bac1d6131309e82cd111da`
- 首頁引用：`src/Prototype.tsx`
- 功能頁共用頁首引用：`src/FeaturePages.tsx`
- 頁首主要樣式：`src/prototype.css`、`src/feature-pages.css`

## 6. 共用底部導覽元件與樣式

- 共用元件：`src/BottomNavigation.tsx`
- 首頁掛載位置：`src/Prototype.tsx`
- 功能頁掛載位置：`src/FeaturePages.tsx`
- 主要樣式：`src/prototype.css`
- 共用 Design Token：`src/design-tokens.css`
- 固定入口：`首頁｜快捷｜通知｜我的`
- 快捷長按時間：`3000ms`
- Safe Area：`env(safe-area-inset-bottom)` 與目前 mobile runtime safe-area 變數共同計算

## 7. 通知頁圖示素材及引用位置

通知頁定義位於 `src/FeaturePages.tsx` 的通知設定列資料。

| 通知項目 | 實際引用 | 實體檔案 | SHA-256 |
| --- | --- | --- | --- |
| Matrix 牌單 | `/resources/notify-card.png` | `public/resources/notify-card.png` | `a98a56bfc262466736613ecd36398dabcfa58f11fc979da693b9a12ce1c533bd` |
| Matrix 摘星 | `/resources/notify-collision.png` | `public/resources/notify-collision.png` | `1972862d2182bef8c64c29aa8f27747583f404ead85ec2adc6d095f9e4b11456` |
| 系統通知 | `/resources/notify-system.png` | `public/resources/notify-system.png` | `1fd77f75a526ba2d069246c1d43890cccd84dedc1840059d5b47af8e30a73f20` |

其他通知圖示也位於 `public/resources/notify-*.png`，並已包含於本 ZIP。

## 8. 目前線上預覽網址

<https://lottery-matrix-work.spyuilin688.chatgpt.site>

## 9. 安裝、啟動及 Build 指令

```bash
npm install
npm run dev
npm run build
npm run preview
```

`package.json` 目前實際 scripts：

- `dev`：`vite`
- `build`：`tsc && vite build`
- `preview`：`vite preview`

## 10. 已知問題與注意事項

1. 2026-08-09 Build 成功，但 Vite 顯示現有主要 JavaScript chunk 壓縮後大於 500 kB 的警告；本次未修改程式處理。
2. 目前沒有 `manifest.webmanifest`、其他 Web App Manifest 或 Service Worker 實作。
3. `public/resources/lottery-matrix` 是目前專案內原本保留的 AppDeploy 歷史 ZIP 資源；本次僅因完整保留目前 `public/` 而收入 ZIP，沒有將它作為打包來源。一般 Work 開發與 Build 不需執行 `scripts/import-lottery-zip.mjs` 或 `scripts/apply-document-update.mjs`。
4. `scripts/` 內兩個 `.mjs` 檔案與 `APPDEPLOY_RESOURCE_NOTE.txt`、`scripts/APPDEPLOY_MIGRATION_HISTORY.md` 為既有歷史／遷移資料，本次未執行、未修改產品 UI。
5. 本次對話另外上傳的圖片位於專案外部，沒有被目前 React 原始碼直接引用；依「唯一打包來源」規則未自行加入專案或改寫素材引用。

## 本次打包規則

- 已包含：完整 `src/`、`public/`、`scripts/`、`tests/`、設定檔、套件鎖定檔、所有目前專案內素材、`PROJECT_HANDOFF.md`、`FILE_MANIFEST.txt`。
- 已排除：`node_modules/`、`dist/`、快取、日誌、系統暫存檔。
- 未修改：既有 React／TypeScript 程式碼、CSS、文案、功能、路由、版面及圖片素材。

## 11. 六合彩歷史日期補入規則（2026-08-14）

- 爬蟲 AppDeploy：`app-snsxet`
- NFD 保留正式期數與號碼。
- sc888 六合彩頁面：`https://sc888.net/index.php?s=/LotterySix/index`
- sc888 只提供歷史開獎日期。
- 只有期數、6 個一般號碼及特別號與 NFD 完全一致時，才補入 `drawDate`。
- 期數或 7 個號碼任一不一致時，`drawDate` 維持空白。
- sc888 不得修改 NFD 的期數、`sortedNumbers` 或 `drawOrderNumbers`。
- 前端 `src/lottery-api.ts` 已由 `app-snsxet` 讀取 `drawDate`，不需修改前端資料流程。
- AppDeploy 版本：`1786673435106`，8 項端對端測試通過。\n- 2026-08-14 實際同步結果：sc888 找到 100 筆、與 NFD 精確一致 38 筆、補入空白歷史日期 12 筆、號碼不一致 0 筆。
