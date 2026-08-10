# 樂彩 Matrix－線上預覽工程交付

線上預覽：

https://lottery-matrix-preview.spyuilin688.chatgpt.site

本專案是目前線上預覽對應的完整 React 原始碼。交付內容包含首頁元件、Pixel 10 預覽外框、Design Token、圖片素材、建置設定、套件鎖定檔與測試檔。

## 執行環境

- Node.js：22.13.0 以上
- 套件管理：npm
- React：19
- TypeScript
- Vite

## 安裝與執行

```bash
npm ci
npm run dev
```

Linux CI／Sites 環境可用 `npm run install:ci` 執行有界、lockfile 驗證的安裝。現行架構為 React＋TypeScript＋Vite，不使用 vinext。

正式建置：

```bash
npm run build
```

完整工程驗證：

```bash
npm run build:verified
npm run test:sites
npm run install:test-browser # 僅首次或瀏覽器缺件時
npm run test:runtime
```

## 主要入口

| 用途 | 檔案 |
|---|---|
| React 入口 | `src/main.tsx` |
| App 組合 | `src/App.tsx` |
| 首頁與可重用元件 | `src/Prototype.tsx` |
| 首頁樣式 | `src/prototype.css` |
| Design Token | `src/design-tokens.css` |
| 全域與手機預覽樣式 | `src/styles.css` |
| Pixel 10／手機預覽 Runtime | `src/mobile/` |
| 圖片素材 | `public/assets/` |
| 套件與指令 | `package.json` |
| 固定依賴版本 | `package-lock.json` |

## 線上預覽已實作範圍

- 樂彩 Matrix 品牌頁首
- 四彩種切換：今彩539、天天樂、六合彩、大樂透
- 最新開獎資訊卡
- 順球／落球切換
- 全部紀錄按鈕外觀
- 下次開獎時間
- 剩餘開獎時間
- Matrix 狀態入口區
- Matrix Core 入口
- 五大功能入口列
- 底部導覽
- Pixel 10 手機畫面

目前的按鈕僅實作線上預覽已有的互動。功能內頁、API、會員、訂閱、通知與實際開獎資料串接不在此線上預覽原始碼內。

## 資料替換界線

`src/Prototype.tsx` 內的下列常數是線上預覽使用的展示資料：

- `DRAW_RESULTS`
- `NEXT_DRAW_INFO`
- `MATRIX_STATUS_BY_LOTTERY`

工程串接正式資料時，應由上層資料層傳入對應 Props；不得改變元件的視覺結構、彩種名稱、功能名稱或既有排列。

## 可直接匯入的首頁元件

```ts
import {
  LotterySwitcher,
  LatestDrawCard,
  NextDrawInfoBar,
  MatrixStatusSection,
  MatrixCoreBanner,
  HomeShortcutRow,
  BrandLoading,
  BottomNavigation,
} from "./src/Prototype";
```

詳細 Props 與使用位置見 `docs/COMPONENT_MAP.md`。

## 素材規則

- 所有 Logo、彩球、狀態圖、功能圖與背景圖均使用 `public/assets/` 內檔案。
- 使用時維持原比例。
- 不得從參考畫面裁切 Logo。
- 不得重畫、改色、拉伸或裁切 Logo。

## 驗收基準

- 預設畫面為 Pixel 10。
- 手機內容寬度為 390px。
- 首頁主要內容不需上下滑動。
- 四個彩種固定同一列。
- 五大功能固定同一列。
- 底部導覽固定顯示。
- React 畫面需與線上預覽一致。
