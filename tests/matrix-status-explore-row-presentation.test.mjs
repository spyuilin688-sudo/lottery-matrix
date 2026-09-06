import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const statusCss = readFileSync(new URL('../src/feature-pages.css', import.meta.url), 'utf8');
const exploreCss = readFileSync(new URL('../src/matrix-explore-spacing.css', import.meta.url), 'utf8');

function rule(source, selector) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return source.match(new RegExp(`${escapedSelector}\\s*\\{[^}]*\\}`, 's'))?.[0] ?? '';
}

test('Matrix 狀態觸發卡不重複疊加 status-detail 的卡片外距', () => {
  const triggerCardRule = rule(statusCss, '.matrix-status-screen .matrix-status-trigger-card');

  assert.match(triggerCardRule, /margin-top:\s*0;/);
});

test('Matrix 狀態版路列比照探索結果區使用連續列與分隔線', () => {
  const roadArticleRule = rule(statusCss, '.matrix-status-screen .matrix-status-road-results > article');
  const separatorRule = rule(statusCss, '.matrix-status-screen .matrix-status-road-results > article + article');

  assert.match(roadArticleRule, /margin-top:\s*0;/);
  assert.match(roadArticleRule, /border:\s*0;/);
  assert.match(roadArticleRule, /border-radius:\s*0;/);
  assert.match(roadArticleRule, /overflow:\s*visible;/);
  assert.match(separatorRule, /border-top:\s*1px solid rgba\(57,\s*55,\s*49,\s*\.58\);/);
});

test('Matrix 狀態版路欄寬與探索結果區一致', () => {
  const statusColumns = rule(statusCss, '.matrix-status-screen .road-results-head,\n.matrix-status-screen .road-result-row')
    .match(/grid-template-columns:\s*([^;]+);/)?.[1];
  const exploreColumns = rule(exploreCss, '.matrix-explore-main-screen .road-results-head,\n.matrix-explore-main-screen .road-result-row')
    .match(/grid-template-columns:\s*([^;]+);/)?.[1];

  assert.ok(statusColumns);
  assert.equal(statusColumns, exploreColumns);
});
