import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/FeaturePages.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../src/feature-pages.css", import.meta.url), "utf8");
const compactCss = readFileSync(new URL("../src/activation-code-layout.css", import.meta.url), "utf8");
const start = source.indexOf("function ActivationCodePage");
const end = source.indexOf("function InviteFriendsPage", start);
const page = source.slice(start, end);

test("referral and activation content appears once in the required order", () => {
  for (const marker of [
    'className="referral-summary-card"',
    'id="referral-code"',
    'title="推薦成功認定"',
    'title="推薦成功獎勵"',
    'title="推薦獎勵補充規則"',
    'id="activation-code"',
    'title="啟動碼使用說明"',
  ]) {
    assert.equal(page.split(marker).length - 1, 1, marker);
  }

  const ordered = [
    'className="referral-summary-heading"',
    "<h2>輸入推薦碼</h2>",
    'title="推薦成功認定"',
    'title="推薦成功獎勵"',
    'title="推薦獎勵補充規則"',
    'className="panel activation-code-section"',
    'title="啟動碼使用說明"',
  ];
  let previous = -1;
  for (const marker of ordered) {
    const current = page.indexOf(marker);
    assert.ok(current > previous, marker);
    previous = current;
  }
});

test("referral and activation layout keeps the approved responsive measurements", () => {
  assert.match(css, /\.activation-code-screen \.feature-body\s*\{[^}]*padding-inline:\s*16px;[^}]*gap:\s*12px;/s);
  assert.match(css, /\.referral-code-section,\s*\.activation-code-section\s*\{[^}]*padding:\s*16px;[^}]*gap:\s*12px;/s);
  assert.match(css, /\.referral-primary-actions\s*\{[^}]*margin-top:\s*4px;[^}]*gap:\s*8px;/s);
  assert.match(css, /\.referral-input-card \.code-entry-block,\s*\.activation-card \.code-entry-block\s*\{[^}]*gap:\s*10px;/s);
  assert.match(css, /\.referral-input-card input,\s*\.activation-card input\s*\{[^}]*height:\s*44px;[^}]*min-height:\s*44px;/s);
  assert.match(css, /\.activation-code-screen \.referral-input-card \.primary-action,\s*\.activation-code-screen \.activation-card \.primary-action\s*\{[^}]*height:\s*40px;[^}]*min-height:\s*40px;/s);
  assert.match(css, /\.referral-rule-toggle\s*\{[^}]*min-height:\s*0;[^}]*padding:\s*4px 16px;[^}]*font-weight:\s*600;/s);
  assert.match(page, /referral-success-count">推薦成功 <strong className="referral-success-value">/);
  assert.match(page, /referral-summary-heading">\s*<h2>我的推薦碼<\/h2>\s*<p className="referral-success-count">/s);
  assert.match(css, /\.referral-summary-heading\s*\{[^}]*gap:\s*8px;/s);
  assert.match(page, /className="activation-card-toggle"[^>]*aria-expanded=\{activationOpen\}[^>]*aria-controls="activation-code-panel"/s);
  assert.match(page, /id="activation-code-panel"[^>]*hidden=\{!activationOpen\}/s);
});

test("activation rule headers are borderless with 4px vertical padding", () => {
  assert.match(compactCss, /\.activation-code-screen \.referral-rule-card\s*\{[^}]*border:\s*0;/s);
  assert.match(compactCss, /\.activation-code-screen \.referral-rule-toggle\s*\{[^}]*padding-block:\s*4px;/s);
});
