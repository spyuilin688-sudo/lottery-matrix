import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import * as workerPolicy from '../backend/matrix-analysis-cron.ts';

test('daily-lottery workers reserve enough runtime for persistence', () => {
  assert.deepEqual(workerPolicy.matrixWorkerLimits?.('今彩539'), {
    maxExploreGroups: 1,
    batchBudgetMs: 15_000,
  });
  assert.deepEqual(workerPolicy.matrixWorkerLimits?.('天天樂'), {
    maxExploreGroups: 1,
    batchBudgetMs: 15_000,
  });
  assert.deepEqual(workerPolicy.matrixWorkerLimits?.('六合彩'), {
    maxExploreGroups: 20,
    batchBudgetMs: 22_000,
  });
  assert.deepEqual(workerPolicy.matrixWorkerLimits?.('大樂透'), {
    maxExploreGroups: 20,
    batchBudgetMs: 22_000,
  });
  assert.deepEqual(workerPolicy.matrixWorkerLimits?.('六合彩', true), {
    maxExploreGroups: 1,
    batchBudgetMs: 15_000,
  });
  assert.deepEqual(workerPolicy.matrixWorkerLimits?.('大樂透', true), {
    maxExploreGroups: 1,
    batchBudgetMs: 15_000,
  });
});

test('analysis starts immediately after the latest draw refresh completes', async () => {
  assert.equal(typeof workerPolicy.runRefreshThenAnalysis, 'function');

  const calls = [];
  const response = await workerPolicy.runRefreshThenAnalysis(
    async () => {
      calls.push('refresh');
      return { updated: true };
    },
    async () => {
      calls.push('analysis');
      return { pending: true };
    },
  );

  assert.deepEqual(calls, ['refresh', 'analysis']);
  assert.deepEqual(response, {
    refresh: { updated: true },
    analysis: { pending: true },
  });
});

test('fantasy5 uses a new dedicated handler so a disabled scheduler is not reused', () => {
  const crons = JSON.parse(readFileSync(new URL('../cron.json', import.meta.url), 'utf8'));
  const fantasy5 = crons.find((entry) => entry.payload?.lottery === '天天樂');
  const backendIndex = readFileSync(new URL('../backend/index.ts', import.meta.url), 'utf8');

  assert.equal(fantasy5?.name, 'matrix-fantasy5-worker-v11');
  assert.equal(fantasy5?.handler, 'scheduledFantasy5MatrixAnalysisRefresh');
  assert.match(backendIndex, /export const scheduledFantasy5MatrixAnalysisRefresh/);
});
