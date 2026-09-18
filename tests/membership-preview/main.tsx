import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { ProfilePage, ProPlansPage } from "../../src/features/MemberPages";
import { AppDialogProvider } from "../../src/dialog/AppDialog";
import type { ScreenId } from "../../src/features/navigation";
import { MobileScroll } from "../../src/mobile/MobileScroll";
import { MobileDeviceProvider } from "../../src/mobile/Device";
import { KeyboardProvider } from "../../src/mobile/Keyboard";
import "@fontsource/roboto/latin-500.css";
import "@fontsource/roboto/latin-700.css";
import "@fontsource/roboto/latin-900.css";
import "../../src/feature-pages.css";
import "../../src/styles.css";
import "../../src/prototype.css";
import "../../src/brand-header-unify.css";
import "../../src/homepage-repair.css";
import "../../src/responsive-feature-pages.css";
import "../../src/tongxing-compact.css";
import "../../src/matrix-explore-spacing.css";
import "../../src/matrix-explore-result-13px.css";
import "../../src/feature-page-adjustments.css";
import "../../src/notification-visual-refinement.css";
import "../../src/number-reference-visual-refinement.css";
import "../../src/pro-plans-layout.css";
import "../../src/pro-plans-carousel-peek.css";
import "./preview.css";

function Preview() {
  const query = new URLSearchParams(location.search);
  const width = [320, 360, 390, 430].includes(Number(query.get("width"))) ? Number(query.get("width")) : 390;
  return <>
    <aside className="qa-toolbar">
      <strong>A＋B 會員卡驗證</strong>
      <span>測試資料・未連接正式帳號</span>
      <nav aria-label="測試寬度">{[320, 360, 390, 430].map(value => <a key={value} href={`?width=${value}&state=${query.get("state") ?? "year"}`}>{value}px</a>)}</nav>
      <nav aria-label="測試狀態">{[["year", "年費"], ["long", "長暱稱"], ["anonymous", "未登入"], ["free", "免費"], ["lifetime", "終身"], ["error", "重試"], ["logout-error", "登出失敗"], ["profile-error", "資料失敗"]].map(([value, label]) => <a key={value} href={`?width=${width}&state=${value}`}>{label}</a>)}</nav>
    </aside>
    <iframe className="qa-viewport" title={`${width}px 會員頁`} style={{ width }} src={`?inner=1&state=${query.get("state") ?? "year"}`} />
    {query.has("compare") && <figure className="qa-reference"><figcaption>已確認的 A＋B 參考圖（按卡片寬度對齊）</figcaption><img src="/docs/qa/member-cards/reference-ab.png" alt="已確認的 A＋B 會員卡設計" /></figure>}
  </>;
}

function Inner() {
  const [route, setRoute] = useState<ScreenId>("profile");
  return <AppDialogProvider><MobileDeviceProvider><KeyboardProvider><div className="app-mobile-canvas"><MobileScroll>
    {route === "pro-plans" ? <ProPlansPage onNavigate={setRoute} /> : <ProfilePage onNavigate={setRoute} />}
  </MobileScroll></div></KeyboardProvider></MobileDeviceProvider></AppDialogProvider>;
}
createRoot(document.getElementById("root")!).render(new URLSearchParams(location.search).has("inner") ? <Inner /> : <Preview />);
