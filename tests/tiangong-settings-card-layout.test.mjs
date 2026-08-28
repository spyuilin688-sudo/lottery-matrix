import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../src/FeaturePages.tsx', import.meta.url), 'utf8');
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
  assert.doesNotMatch(generalCard, /aria-label="第一段球位"/);
  assert.doesNotMatch(generalCard, /aria-label="第一段版路類型"/);
  assert.match(stageCard, /<SectionTitle>第一段探索設定<\/SectionTitle>/);
  assert.match(stageCard, /aria-label="第一段球位"/);
  assert.match(stageCard, /aria-label="第一段版路類型"/);
  assert.match(stageCard, /mode === "二段式"[\s\S]*<SectionTitle>第二段探索設定<\/SectionTitle>/);
  assert.match(stageCard, /aria-label="第二段球位"/);
  assert.match(stageCard, /aria-label="第二段版路類型"/);
});
