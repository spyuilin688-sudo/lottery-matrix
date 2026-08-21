import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const backend = fs.readFileSync('backend/index.ts', 'utf8');
const crons = JSON.parse(fs.readFileSync('cron.json', 'utf8'));

test('Matrix workers keep the formal batch budget and Fantasy5 uses a fresh cron registration', () => {
  assert.match(backend, /maxExploreGroups:\s*20/);
  assert.match(backend, /batchBudgetMs:\s*22_000/);
  assert.doesNotMatch(backend, /maxExploreGroups:\s*trackedLottery === '天天樂'/);
  assert.doesNotMatch(backend, /batchBudgetMs:\s*trackedLottery === '天天樂'/);

  const fantasy5 = crons.find((entry) => entry?.payload?.lottery === '天天樂');
  assert.ok(fantasy5);
  assert.equal(fantasy5.name, 'matrix-fantasy5-worker-v4');
  assert.equal(fantasy5.cron, '1-59/5 * * * *');
  assert.equal(fantasy5.handler, 'scheduledMatrixAnalysisRefresh');
  assert.deepEqual(fantasy5.payload, {
    lottery: '天天樂',
    sourceId: 'sc888',
    refreshHour: 18,
  });
});
