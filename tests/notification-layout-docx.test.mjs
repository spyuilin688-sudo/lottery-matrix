import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const featureCss = fs.readFileSync('src/feature-pages.css', 'utf8');
const runtimeCss = fs.readFileSync('src/styles.css', 'utf8');

test('notification page follows the uploaded 390px layout specification', () => {
  assert.match(featureCss, /\.notifications-screen \.feature-body \{ padding: 8px 12px calc\(var\(--bottom-navigation-height\) \+ var\(--mobile-safe-area-height, 34px\) \+ 12px\); \}/);
  assert.match(featureCss, /\.notification-list \{ display: grid; gap: 8px; \}/);
  assert.match(featureCss, /\.notification-row \{[^}]*width: 100%;[^}]*height: 80px;[^}]*padding: 8px;/);
  assert.match(featureCss, /\.notification-heading \{[^}]*grid-template-columns: 58px minmax\(0, 1fr\) 88px 46px;[^}]*column-gap: 8px;/);
  assert.match(featureCss, /\.notification-icon \{[^}]*width: 58px;[^}]*height: 58px;/);
  assert.match(featureCss, /\.notification-icon img \{[^}]*width: 58px;[^}]*height: 58px;[^}]*object-fit: contain;/);
  assert.doesNotMatch(featureCss, /\.notification-icon \{[^}]*border:/);
  assert.doesNotMatch(featureCss, /\.notification-icon \{[^}]*box-shadow:/);
  assert.match(featureCss, /\.notification-actions \{ display: contents; \}/);
  assert.match(featureCss, /\.notification-actions > button:first-child \{[^}]*width: 88px;[^}]*height: 38px;[^}]*border-radius: 19px;[^}]*font-size: 14px;[^}]*font-weight: 600;/);
  assert.match(featureCss, /\.notification-row h2 \{[^}]*color: #F2F2F2;[^}]*font-size: 17px;[^}]*font-weight: 700;[^}]*line-height: 23px;[^}]*letter-spacing: 0;/);
  assert.match(featureCss, /\.notification-row h2 em \{[^}]*height: 22px;[^}]*padding: 0 8px;[^}]*border-radius: 7px;[^}]*font-size: 12px;[^}]*font-weight: 600;/);
  assert.match(featureCss, /\.notifications-screen \.notification-row \{[^}]*border-radius: 14px;[^}]*background: #020C12;/);
  assert.match(featureCss, /\.toggle \{[^}]*width: 46px;[^}]*height: 44px;/);
  assert.match(featureCss, /\.toggle::before \{[^}]*width: 46px;[^}]*height: 28px;[^}]*border: 1px solid #46505C;[^}]*border-radius: 14px;[^}]*background: #151B22;/);
  assert.match(featureCss, /\.toggle span \{[^}]*width: 24px;[^}]*height: 24px;/);
  assert.match(featureCss, /\.toggle\[data-checked="true"\]::before \{[^}]*background: #D99B00;/);
  assert.match(featureCss, /\.toggle\[data-checked="true"\] span \{[^}]*translateX\(18px\)/);
  assert.doesNotMatch(featureCss, /@media \(max-width: 370px\) \{\s*\.notification-heading/);
  assert.doesNotMatch(featureCss, /\.notifications-screen \.feature-body,\s*\.profile-screen \.feature-body/);
  assert.match(runtimeCss, /\.mobile-page:not\(:has\(\.notifications-screen\)\) \.mobile-scrollbar\[data-visible="true"\] \{\s*opacity: 1;\s*\}/);
});
