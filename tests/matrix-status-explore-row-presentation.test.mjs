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

test('Matrix 狀態每個同碼結果使用獨立結果框與各自表頭', () => {
  const triggerTableRule = rule(statusCss, '.matrix-status-screen .matrix-status-trigger-table');
  const groupRule = rule(statusCss, '.matrix-status-screen .matrix-status-trigger-group');
  const groupSeparatorRule = rule(statusCss, '.matrix-status-screen .matrix-status-trigger-group + .matrix-status-trigger-group');

  assert.match(statusComponent, /className="matrix-status-trigger-table"/);
  assert.match(statusComponent, /showColumnHead=\{true\}/);
  assert.match(statusComponent, /\{showColumnHead \? \([\s\S]*?className="road-results-head"[\s\S]*?\) : null\}/);
  assert.match(triggerTableRule, /display:\s*grid;/);
  assert.match(triggerTableRule, /gap:\s*8px;/);
  assert.match(triggerTableRule, /overflow:\s*visible;/);
  assert.match(triggerTableRule, /border:\s*0;/);
  assert.match(groupRule, /overflow:\s*hidden;/);
  assert.match(groupRule, /border:\s*1px solid var\(--border\);/);
  assert.match(groupRule, /border-radius:\s*8px;/);
  assert.equal(groupSeparatorRule, '');
  assert.ok(!statusComponent.includes('matrix-status-group-divider'));
  assert.ok(!statusCss.includes('matrix-status-group-divider'));
  assert.ok(statusComponent.includes('data-expanded={expanded}'));
  const expandedRule = rule(statusCss, '.matrix-status-screen .status-block[data-expanded="true"]');
  assert.match(expandedRule, /border:\s*0;/);
  assert.equal((statusComponent.match(/className="matrix-status-category-heading"/g) ?? []).length, 1);
  const categoryRule = rule(statusCss, '.matrix-status-screen .status-block > button');
  assert.match(categoryRule, /min-height:\s*0;/);
  assert.match(categoryRule, /padding:\s*8px 10px;/);
  const headRule = rule(statusCss, '.matrix-status-screen .road-results-head');
  assert.match(headRule, /min-height:\s*0;/);
  assert.match(headRule, /padding:\s*4px 0;/);
  const trigger = statusComponent.slice(statusComponent.indexOf('export function MatrixStatusTriggerCard'), statusComponent.indexOf('export function MatrixStatusPage'));
  assert.ok(!trigger.includes('兩碼結果'));
  assert.ok(!trigger.includes('同碼版路數量'));
  assert.ok(!trigger.includes('matrix-status-trigger-state'));
  assert.match(rule(statusCss, '.matrix-status-screen .matrix-status-trigger-summary'), /grid-template-columns:\s*minmax\(0, 1fr\) minmax\(92px, auto\);/);
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

test('Matrix 狀態進入與切換彩種後保持收合，資料回應不會自動展開', () => {
  const effect = statusComponent.slice(statusComponent.indexOf('  useEffect(() => {'), statusComponent.indexOf('  const toggleRoad ='));
  assert.ok(effect.includes('setOpen("");'));
  const responseHandler = effect.slice(effect.indexOf('.then((response) => {'), effect.indexOf('.catch('));
  assert.ok(!responseHandler.includes('setOpen('));
  assert.ok(statusComponent.includes('setOpen(expanded ? "" : titleEn)'));
});
