<!doctype html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
  <title>樂彩 Matrix - 探索</title>
  <style>
    /* ===================================================
       📱 樂彩 Matrix 官方版型 - 鋼鐵骨架與極細黑金視覺
       =================================================== */
    :root {
      --bg: #050b11;               /* 原圖極深科技黑藍 */
      --panel-bg: transparent;     /* 純淨透明板塊，絕無突兀底色 */
      --gold: #dcb365;             /* 高級內斂金 */
      --gold-border: rgba(220, 179, 101, 0.25); /* 1px 極細半透明暗金邊框 */
      --text: #ffffff;             /* 純白文字 */
      --muted: #a0aab5;            /* 高質感灰白 */
      --orange-ball: #f18d00;      /* 彩券正橘色 */
      --line: rgba(255, 255, 255, 0.08); /* 超細表格分割線 */
      --radius: 6px;               /* 嚴格微圓角 */
    }

    * {
      box-sizing: border-box;
      box-shadow: none !important;  /* 徹底扒光所有發光與粗陰影 */
      text-shadow: none !important; /* 徹底扒光所有文字發光 */
    }

    html, body {
      margin: 0;
      padding: 0;
      min-height: 100%;
      background: var(--bg);
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      -webkit-tap-highlight-color: transparent;
    }

    body {
      display: flex;
      justify-content: center;
    }

    /* 全頁手機版型外殼 */
    .app {
      width: min(390px, 100%);
      padding: 0 16px 80px; /* 底部留白給導覽列 */
      display: flex;
      flex-direction: column;
    }

    /* 頂部 Logo 區塊 */
    .brand-header {
      width: 100%;
      text-align: center;
      padding: 16px 0 4px;
    }
    .brand-logo {
      font-size: 20px;
      font-weight: 800;
      letter-spacing: 1px;
      background: linear-gradient(180deg, #fff 30%, #dcb365 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      margin: 0;
    }
    .brand-subtitle {
      font-size: 15px;
      color: #ffffff;
      margin: 4px 0 0;
      font-weight: 400;
      letter-spacing: 2px;
    }

    /* 1px 極細邊框區塊骨架 */
    .section {
      border: 1px solid var(--gold-border);
      border-radius: var(--radius);
      background: var(--panel-bg);
      padding: 12px;
      margin-top: 14px;
    }

    .section-title {
      display: flex;
      align-items: center;
      gap: 6px;
      margin: 0 0 12px;
      font-size: 14px;
      font-weight: bold;
      color: var(--gold);
    }

    .section-title::before {
      width: 3px;
      height: 13px;
      border-radius: 1px;
      background: var(--gold);
      content: "";
    }

    /* 探索設定網格 */
    .setting-list {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .setting-row {
      display: grid;
      grid-template-columns: 85px minmax(0, 1fr);
      gap: 8px;
      align-items: center;
    }

    .setting-label {
      color: var(--muted);
      font-size: 13px;
      font-weight: 500;
    }

    /* 下拉選單與按鈕基礎樣式 */
    .control,
    .segmented button,
    .hit-button {
      height: 32px;
      border: 1px solid var(--gold-border);
      border-radius: var(--radius);
      background: rgba(10, 15, 26, 0.6);
      color: #ffffff;
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .control {
      width: 100%;
      padding: 0 12px;
      position: relative;
      justify-content: space-between;
    }

    .control-value {
      flex: 1;
      text-align: left;
    }

    .control-arrow {
      width: 0;
      height: 0;
      border-left: 4px solid transparent;
      border-right: 4px solid transparent;
      border-top: 5px solid var(--gold);
    }

    .segmented {
      display: grid;
      gap: 6px;
    }
    .segmented.three { grid-template-columns: repeat(3, minmax(0, 1fr)); }
    .segmented.two { grid-template-columns: repeat(2, minmax(0, 1fr)); }

    /* 按鈕啟用狀態（Active）- 精確還原原圖高質感金 */
    .segmented button[aria-pressed="true"],
    .hit-button[aria-pressed="true"] {
      background: linear-gradient(180deg, #dcb365 0%, #b58c43 100%) !important;
      color: #06090e !important;
      border-color: #dcb365 !important;
      font-weight: bold;
    }

    /* Matrix Pro 與 推薦 標籤額外點綴 */
    .btn-badge-pro, .btn-badge-rec { position: relative; }
    .btn-badge-pro::after {
      content: "Matrix Pro";
      position: absolute; top: -7px; right: -2px;
      background: rgba(220, 179, 101, 0.2); color: #dcb365;
      font-size: 7px; padding: 0px 3px; border-radius: 3px; transform: scale(0.8);
    }
    .btn-badge-rec::after {
      content: "推薦";
      position: absolute; top: -7px; right: -2px;
      background: rgba(241, 141, 0, 0.2); color: #f18d00;
      font-size: 7px; padding: 0px 3px; border-radius: 3px; transform: scale(0.8);
    }

    /* 命中條件區 */
    .hit-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px;
      margin-bottom: 12px;
    }
    .hit-button { height: 34px; font-weight: bold; }

    /* 進階探索設定行 */
    .advanced-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      color: var(--muted);
      font-size: 13px;
      cursor: pointer;
      padding-top: 4px;
    }
    .advanced-left { display: flex; align-items: center; gap: 6px; }
    .advanced-icon { width: 14px; height: 14px; opacity: 0.8; }
    .chevron {
      width: 6px; height: 6px;
      border-right: 1px solid var(--gold); border-bottom: 1px solid var(--gold);
      transform: rotate(-45deg);
    }

    /* 開始探索大按鈕 */
    .primary-action {
      width: 100%;
      height: 38px;
      margin-top: 14px;
      border: 1px solid var(--gold);
      border-radius: var(--radius);
      background: rgba(10, 15, 26, 0.4);
      color: var(--gold);
      font-size: 15px;
      font-weight: bold;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
    }

    /* 表格與開獎號碼區 */
    .history-heading {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 4px 0 10px;
    }
    .history-heading h2 { margin: 0; font-size: 13px; color: var(--gold); }
    .history-heading a { color: var(--muted); font-size: 12px; text-decoration: none; }

    .history-table { width: 100%; border-collapse: collapse; }
    .th-row, .td-row {
      display: grid;
      grid-template-columns: 60px 80px 1fr;
      padding: 8px 0;
      align-items: center;
      text-align: center;
    }
    .th-row { color: var(--muted); font-size: 12px; border-bottom: 1px solid var(--gold-border); }
    .td-row { border-bottom: 1px solid var(--line); font-size: 13px; }
    .cell-date { color: var(--muted); font-size: 12px; }

    /* 號碼球：絕對正圓、橘底黑字、帶底線 */
    .cell-balls { display: flex; gap: 5px; justify-content: center; }
    .lotto-ball {
      width: 25px; height: 25px;
      background-color: var(--orange-ball) !important;
      color: #000000 !important;
      font-weight: 800;
      border-radius: 50% !important;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      text-decoration: underline !important;
      font-size: 13px;
    }

    /* 重複號碼統計區 */
    .stat-badge {
      font-size: 10px; background: rgba(255,255,255,0.08);
      padding: 1px 4px; border-radius: 3px; color: var(--muted); margin-left: 6px;
    }
    .stat-grid {
      display: grid;
      grid-template-columns: repeat(6, minmax(0, 1fr));
      gap: 6px;
      text-align: center;
    }
    .stat-box {
      border: 1px solid rgba(255,255,255,0.05);
      background: rgba(255,255,255,0.02);
      border-radius: 4px;
      padding: 6px 0;
    }
    .stat-num { font-size: 14px; font-weight: bold; color: #ffffff; }
    .stat-count { font-size: 10px; color: var(--muted); margin-top: 2px; }

    /* 底部聲明小字 */
    .footer-disclaimer {
      font-size: 11px;
      color: rgba(255, 255, 255, 0.3);
      text-align: center;
      margin-top: 16px;
      line-height: 16px;
    }

    /* 底部固定導覽列 */
    .nav-bar {
      position: fixed;
      bottom: 0; left: 50%;
      transform: translateX(-50%);
      width: min(390px, 100%);
      height: 60px;
      background: #06090e;
      border-top: 1px solid var(--gold-border);
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      align-items: center;
      text-align: center;
    }
    .nav-item {
      display: flex;
      flex-direction: column;
      align-items: center;
      color: var(--muted);
      font-size: 11px;
      text-decoration: none;
      gap: 4px;
    }
    .nav-item.active { color: var(--gold); font-weight: bold; }
    .nav-icon { width: 20px; height: 20px; background: currentColor; opacity: 0.3; }
    .nav-item.active .nav-icon { opacity: 1; }
  </style>
</head>
<body>

  <div class="app">
    
    <!-- 頂部標題區 -->
    <div class="brand-header">
      <h1 class="brand-logo">Ｍ 樂彩 Matrix</h1>
      <p class="brand-subtitle">Matrix 探索</p>
    </div>

    <!-- 探索設定 -->
    <div class="section">
      <div class="section-title">探索設定</div>
      <div class="setting-list">
        <div class="setting-row">
          <div class="setting-label">彩種</div>
          <div class="control">
            <span class="control-value">今彩539</span>
            <span class="control-arrow"></span>
          </div>
        </div>
        <div class="setting-row">
          <div class="setting-label">探索期數</div>
          <div class="segmented three">
            <button type="button">二期</button>
            <button type="button">七期</button>
            <button type="button" class="btn-badge-pro" aria-pressed="true">十三期</button>
          </div>
        </div>
        <div class="setting-row">
          <div class="setting-label">版路類型</div>
          <div class="segmented three">
            <button type="button" aria-pressed="true">加減版路</button>
            <button type="button">合值版路</button>
