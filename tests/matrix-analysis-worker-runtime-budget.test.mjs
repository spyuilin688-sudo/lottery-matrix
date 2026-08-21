import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const backend = fs.readFileSync('backend/index.ts', 'utf8');
const crons = JSON.parse(fs.readFileSync('cron.json', 'utf8'));

test('天天樂 Matrix worker stays inside the AppDeploy runtime budget and uses a fresh cron registration', () => {
  assert.match(backend, /maxExploreGroups:\s*trackedLottery === '天天樂' \? 1 : 20/);
  assert.match(backend, /batchBudgetMs:\s*trackedLottery === '天天樂' \? 15_000 : 22_000/);

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
