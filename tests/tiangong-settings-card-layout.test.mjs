import { readFeaturePagesSource } from "./helpers/read-feature-pages-source.mjs";
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFeaturePagesSource();
const pageStart = source.indexOf('export function MatrixTiangongPage');
const pageEnd = source.indexOf('export function TongXingPage', pageStart);
const page = source.slice(pageStart, pageEnd);

test('天工一般設定與段落設定由兩張同規格卡片各自承載', () => {
  const generalStart = page.indexOf('tiangong-general-settings');
  const stageStart = page.indexOf('tiangong-stage-settings');
  const actionStart = page.indexOf('branded-explore-action', stageStart);

  assert.notEqual(generalStart, -1);
  assert.notEqual(stageStart, -1);
  assert.ok(stageStart > generalStart);

  const generalCard = page.slice(generalStart, stageStart);
  const stageCard = page.slice(stageStart, actionStart);
  assert.match(generalCard, /彩球類型/);
  assert.match(generalCard, /aria-label="探索球位"/);
  assert.doesNotMatch(generalCard, /進階探索設定|探索模式|命中條件/);
  assert.match(stageCard, /data-stage="first"[\s\S]*<SectionTitle>第一段 探索設定<\/SectionTitle>/);
  assert.match(stageCard, /data-stage="first"[\s\S]*aria-label="探索球位"[\s\S]*aria-label="版路類型"/);
  assert.match(stageCard, /data-stage="second"[\s\S]*<SectionTitle>第二段 探索設定<\/SectionTitle>/);
  assert.match(stageCard, /data-stage="second"[\s\S]*aria-label="探索球位"[\s\S]*aria-label="版路類型"/);
  assert.match(page, /mode:\s*"two-stage"/);
  assert.match(page, /hitCondition:\s*"準2進3"/);
});
