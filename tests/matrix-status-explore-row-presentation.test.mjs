import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const statusCss = readFileSync(new URL('../src/feature-pages.css', import.meta.url), 'utf8');
const exploreCss = readFileSync(new URL('../src/matrix-explore-spacing.css', import.meta.url), 'utf8');
const statusComponent = readFileSync(new URL('../src/features/MatrixStatusPages.tsx', import.meta.url), 'utf8');

function rule(source, selector) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return source.match(new RegExp(`${escapedSelector}\\s*\\{[^}]*\\}`, 's'))?.[0] ?? '';
}

test('Matrix 狀態所有同碼結果共用單一結果框與一份表頭', () => {
  const triggerTableRule = rule(statusCss, '.matrix-status-screen .matrix-status-trigger-table');
  const groupSeparatorRule = rule(statusCss, '.matrix-status-screen .matrix-status-trigger-group + .matrix-status-trigger-group');

  assert.match(statusComponent, /className="matrix-status-trigger-table"/);
  assert.match(statusComponent, /showColumnHead=\{index === 0\}/);
  assert.match(statusComponent, /\{showColumnHead \? \([\s\S]*?className="road-results-head"[\s\S]*?\) : null\}/);
  assert.match(triggerTableRule, /margin-top:\s*0;/);
  assert.match(triggerTableRule, /overflow:\s*hidden;/);
  assert.match(groupSeparatorRule, /border-top:\s*1px solid rgba\(179,\s*139,\s*71,\s*\.58\);/);
});

test('Matrix 狀態驗證摘要不受 status-detail 六欄段落規則影響', () => {
  const summaryRule = rule(statusCss, '.matrix-status-screen .status-detail .explore-validation-summary');

  assert.match(summaryRule, /display:\s*block;/);
  assert.match(summaryRule, /grid-template-columns:\s*none;/);
  assert.match(summaryRule, /border-top:\s*0;/);
  assert.match(summaryRule, /white-space:\s*nowrap;/);
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
