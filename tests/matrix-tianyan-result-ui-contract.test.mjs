import { readFeaturePagesSource } from "./helpers/read-feature-pages-source.mjs";
// Tianyan reuses Matrix Explore filters and only renders historical rules that actually hit.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

const source = readFeaturePagesSource();
const api = readFileSync('src/matrix-algorithm-api.ts', 'utf8');
const spacing = readFileSync('src/matrix-explore-spacing.css', 'utf8');
const migration = readdirSync('supabase/migrations')
  .filter((name) => name.includes('matrix_tianyan'))
  .map((name) => readFileSync(`supabase/migrations/${name}`, 'utf8'))
  .join('\n');

test('Tianyan result UI matches the approved differences', () => {
  assert.match(source, /\{isExplore \|\| isTianheng \? \([\s\S]*?<HistoryList/);
  assert.match(source, /\? \["準11進12", "準14進15", "準15進16", "準16進17", "準17進18"\]/);
  assert.match(source, /algorithmType: item\.roadTypeLabel/);
  assert.match(source, /numberOrder: item\.numberOrder/);
  assert.match(source, /aria-label="天衍驗證過程"/);
  assert.match(source, /const matchedRules = \[row\.rule1, row\.rule2\]\.filter\(\(rule\) => rule\.hit\);/);
});

test('Tianyan road types are exactly the six approved labels', () => {
  for (const label of ['加減版路', '合值版路', '拖牌版路', '加減合值', '加減拖牌', '合值拖牌']) {
    assert.match(api, new RegExp(label));
    assert.match(migration, new RegExp(label));
  }
});

test('Tianyan list preserves distinct draw-period offsets from PR 244', () => {
  assert.match(migration, /distinct on \(run\.draw_period\)/);
  assert.match(migration, /draw_date desc nulls last/);
  assert.match(migration, /offset v_offset/);
});

test('Tianyan duplicate and result filters use the same request contract as Matrix Explore', () => {
  assert.match(api, /fetchTianyanList\(request: \{[\s\S]*?sameCode: boolean;[\s\S]*?predictionNumber\?: string;/);
  assert.match(api, /type TianyanListResponse = \{[\s\S]*?duplicateStats: Array<\{ number: string; count: number \}>;/);
  assert.match(migration, /v_same boolean/);
  assert.match(migration, /v_prediction_number text/);
  assert.match(migration, /'duplicateStats'/);
  assert.match(migration, /limit 18/);
});

test('Tianyan same-code result grouping uses the shared Matrix Explore rule', () => {
  assert.match(spacing, /\.matrix-explore-main-screen \.road-results article\[data-number-group-start="true"\]/);
  assert.doesNotMatch(spacing, /:not\(\.matrix-tianyan-screen\) \.road-results article\[data-number-group-start=/);
});
