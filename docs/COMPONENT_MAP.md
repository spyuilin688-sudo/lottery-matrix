# React 元件對照

## 首頁組合

| 畫面元件 | React Component | Props／資料 | 使用位置 |
|---|---|---|---|
| 完整首頁 | `Prototype` | `isLoading?: boolean` | `src/App.tsx` |
| 品牌載入畫面 | `BrandLoading` | `visible`, `className?` | 首頁 |
| 四彩種切換 | `LotterySwitcher` | `selected`, `onChange`, `className?` | 首頁 |
| 最新開獎資訊卡 | `LatestDrawCard` | `lottery`, `result`, `order`, `onOrderChange`, `onOpenHistory?`, `className?` | 首頁 |
| 下次開獎資訊列 | `NextDrawInfoBar` | `nextDraw`, `remainingTime`, `className?` | 首頁 |
| Matrix 狀態入口 | `MatrixStatusSection` | `statuses?` | 首頁 |
| Matrix Core 入口 | `MatrixCoreBanner` | 無 | 首頁 |
| 五大功能入口列 | `HomeShortcutRow` | 無 | 首頁 |
| 底部導覽 | `BottomNavigation` | 無 | 首頁 |

## 共用型別

型別均定義於 `src/Prototype.tsx`：

```ts
export type LotteryId = "今彩539" | "天天樂" | "六合彩" | "大樂透";
export type DrawOrder = "順球" | "落球";

export type DrawResultData = {
  issue?: string;
  date?: string;
  numbers: string[];
  specialNumber?: string;
};

export type NextDrawInfoData = {
  nextDraw: string;
  remainingTime: string;
};

export type MatrixStatusData = {
  status: "啟動" | "聚合" | "共振" | "臨界";
  statusEn: "ACTIVE" | "FOCUS" | "RESONANCE" | "CRITICAL";
  artwork: string;
  count: number;
  description: string;
  tone: "green" | "blue" | "purple" | "orange";
};

export type MatrixStatusMap = Record<LotteryId, MatrixStatusData>;
```

## 手機預覽 Runtime

| Component | 用途 |
|---|---|
| `MobileRuntime` | 組合裝置、狀態列、鍵盤與畫面容器 |
| `PhoneFrame` | 手機外框與畫面縮放 |
| `MobileScroll` | 手機畫面捲動容器 |
| `StatusBar` | Android／iOS 狀態列 |
| `HomeIndicator` | Android 導覽列／iOS Home Indicator |
| `DevicePicker` | 預覽裝置切換 |
| `Carousel` | 水平滑動內容 |
| `BottomSheet` | 底部彈出層 |
| `KeyboardInput` | 鍵盤預覽輸入框 |
| `KeyboardTextarea` | 鍵盤預覽多行輸入 |

## 首頁元件排列

1. `BrandLoading`
2. 品牌 Logo
3. `LotterySwitcher`
4. `LatestDrawCard`
5. `NextDrawInfoBar`
6. `MatrixStatusSection`
7. `MatrixCoreBanner`
8. `HomeShortcutRow`
9. `BottomNavigation`

不得將 `Matrix Core` 與五大功能入口合併。`Matrix Core` 是進入 `Matrix 探索` 的獨立入口；五大功能是另一組獨立入口列。

