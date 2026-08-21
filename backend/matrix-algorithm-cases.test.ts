import { describe, expect, it, vi } from 'vitest';

vi.mock('./scraper', () => ({
  getMatrixHistory: vi.fn(async () => []),
}));

import { runMatrixAlgorithmCaseChecks } from './matrix-algorithm-cases';

describe('Matrix algorithm case endpoint', () => {
  it('runs the fixed-special-number case without a source-position conflict', async () => {
    const result = await runMatrixAlgorithmCaseChecks();
    const case12 = result.cases.find((item) => item.name.startsWith('案例12'));

    expect(case12, JSON.stringify(case12)).toMatchObject({ pass: true, valid: true });
  });
});
