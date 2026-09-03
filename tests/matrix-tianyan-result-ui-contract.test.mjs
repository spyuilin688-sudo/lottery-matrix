import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync('src/FeaturePages.tsx', 'utf8');
const api = readFileSync('src/matrix-algorithm-api.ts', 'utf8');
const migration = readFileSync('supabase/migrations/20260903073500_matrix_tianyan_result_road_types.sql', 'utf8');

test('Tianyan result UI matches the approved differences', () => {
  assert.match(source, /title === "Matrix 探索" \? \([\s\S]*?<HistoryList/);
  assert.match(source, /\? \["準11進12", "準14進15", "準15進16", "準16進17", "準17進18"\]/);
  assert.match(source, /algorithmType: item\.roadTypeLabel/);
  assert.match(source, /numberOrder: item\.numberOrder/);
  assert.match(source, /aria-label="天衍驗證過程"/);
  assert.match(source, /validationFormula\(row\.rule1[\s\S]*?validationFormula\(row\.rule2/);
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
