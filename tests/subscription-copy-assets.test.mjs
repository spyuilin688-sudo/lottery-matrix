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

test("profile detail pages use the uploaded title artwork", () => {
  assert.match(featurePagesSource, /\/assets\/lottery\/functions\/訂閱方案標題K\.png/);
  assert.doesNotMatch(featurePagesSource, /\/assets\/lottery\/functions\/會員方案標題K\.png/);
  assert.match(
    featurePagesSource,
    /ProfileDetailShell title="我的推薦碼\/啟動碼"[^>]*headerArtwork="\/assets\/lottery\/functions\/推薦啟動標題K\.png"/,
  );
  const legalWrapper = featurePagesSource.slice(
    featurePagesSource.indexOf("function LegalInfoDocument("),
    featurePagesSource.indexOf("function LegalInfoSection("),
  );
  assert.match(legalWrapper, /<ProfileDetailShell[^>]*headerArtwork="\/assets\/lottery\/functions\/法律資訊標題K\.png"/);
  for (const title of ["服務內容與使用說明", "退款規範", "會員服務條例", "隱私權政策", "聲明與免責事項"]) {
    assert.ok(featurePagesSource.includes('<LegalInfoDocument title="' + title + '"'), title + " must use the shared legal artwork owner");
  }
  assert.match(featurePagesSource, /<ProfileDetailShell title="關於 樂彩 Matrix"[^>]*headerArtwork="\/assets\/lottery\/functions\/法律資訊標題K\.png"/);
});

test("database plan prices are migrated to the current approved amounts", () => {
  assert.match(pricingMigrationSource, /\('月費方案', 2880, 30\)/);
  assert.match(pricingMigrationSource, /\('季費方案', 5580, 90\)/);
  assert.match(pricingMigrationSource, /\('年費方案', 17800, 365\)/);
  assert.match(pricingMigrationSource, /on conflict \(name\) do update/i);
});
