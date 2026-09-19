import { readFeaturePagesSource } from "./helpers/read-feature-pages-source.mjs";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const featurePagesSource = readFeaturePagesSource();
const pricingMigrationSource = readFileSync(new URL("../supabase/migrations/20260904032000_update_subscription_plan_prices.sql", import.meta.url), "utf8");

test("subscription pricing and naming use the current approved copy", () => {
  assert.match(featurePagesSource, /\$2,880/);
  assert.match(featurePagesSource, /\$5,580/);
  assert.match(featurePagesSource, /\$17,800/);
  assert.match(featurePagesSource, /NT\$2,880/);
  assert.match(featurePagesSource, /NT\$5,580/);
  assert.match(featurePagesSource, /NT\$17,800/);
  assert.match(featurePagesSource, /month: \{ name: "月費方案", amount: 2880 \}/);
  assert.match(featurePagesSource, /quarter: \{ name: "季費方案", amount: 5580 \}/);
  assert.match(featurePagesSource, /year: \{ name: "年費方案", amount: 17800 \}/);
  assert.match(featurePagesSource, /訂閱方案／收費標準/);
  assert.match(featurePagesSource, /訂閱方案與收費標準/);
  assert.doesNotMatch(featurePagesSource, /會員方案／收費標準/);
  assert.doesNotMatch(featurePagesSource, /Matrix Pro 會員方案與收費標準/);
  assert.doesNotMatch(featurePagesSource, /\$1,880|NT\$1,880|\$4,580|NT\$4,580|\$16,800|NT\$16,800/);
  assert.doesNotMatch(featurePagesSource, /amount: (?:1880|4580|16800)/);
});

test("profile detail pages share BrandHeader and preserve complete page titles", () => {
  const memberPages = readFileSync(new URL('../src/features/MemberPages.tsx', import.meta.url), 'utf8');
  const shared = readFileSync(new URL('../src/features/shared.tsx', import.meta.url), 'utf8');
  const header = readFileSync(new URL('../src/features/BrandHeader.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(memberPages, /headerArtwork|(?:訂閱方案|會員方案|推薦啟動|法律資訊)標題K\.png/);
  assert.match(memberPages, /<FeatureShell title=\{title\} onNavigate=\{onNavigate\} active="我的" backTarget="profile" compactHeader/);
  assert.match(shared, /<BrandHeader\s+title=\{title\}/);
  assert.match(header, /src="\/assets\/lottery\/matrixYY\.png"/);
  for (const title of ["訂閱方案與收費標準", "我的推薦碼/啟動碼", "關於 樂彩 Matrix"]) {
    assert.ok(memberPages.includes('<ProfileDetailShell title="' + title + '"'), title + " must use the shared title owner");
  }
  const legalWrapper = memberPages.slice(
    memberPages.indexOf("function LegalInfoDocument("),
    memberPages.indexOf("function LegalInfoSection("),
  );
  assert.match(legalWrapper, /<ProfileDetailShell title=\{title\}/);
  for (const title of ["服務內容與使用說明", "退款規範", "會員服務條例", "隱私權政策", "聲明與免責事項"]) {
    assert.ok(memberPages.includes('<LegalInfoDocument title="' + title + '"'), title + " must use the shared legal title owner");
  }
});

test("database plan prices are migrated to the current approved amounts", () => {
  assert.match(pricingMigrationSource, /\('月費方案', 2880, 30\)/);
  assert.match(pricingMigrationSource, /\('季費方案', 5580, 90\)/);
  assert.match(pricingMigrationSource, /\('年費方案', 17800, 365\)/);
  assert.match(pricingMigrationSource, /on conflict \(name\) do update/i);
});
