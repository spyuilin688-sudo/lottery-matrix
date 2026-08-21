import { describe, expect, it } from 'vitest';
import type { MatrixDraw } from './matrix-algorithm';
import type { TiangongCandidate, TiangongValidationRow } from './matrix-tiangong';
import {
  buildTiangongArtifact,
  filterTiangongArtifact,
  getTiangongValidation,
  type TiangongFilterRequest,
} from './matrix-tiangong-service';

function candidate(overrides: Partial<TiangongCandidate> = {}): TiangongCandidate {
  return {
    lottery: '今彩539', periodRange: 80, sourceSequence: [1, 3, 5],
    mode: 'one-stage', hitCondition: '準2進3', exploreDirection: '固定',
    baseNumber: 10,
    firstStage: { startPosition: 1, direction: '固定', algorithmType: '加減', value: 5, nextN: 1 },
    validationRows: [], ...overrides,
  };
}

function evidence(group: 'A' | 'B' | 'C' = 'A'): TiangongValidationRow {
  return {
    role: group === 'A' ? 'prediction' : 'first-stage-evidence',
    group,
    sourcePosition: 1,
    sourcePeriod: '114000123',
    sourceNumbers: [1, 2, 3, 4, 5],
    referenceOffset: 0,
    referencePosition: 1,
    referencePeriod: '114000123',
    referenceBallPosition: 1,
    baseNumber: 10,
    firstStage: {
      distance: 1,
      position: 1,
      algorithmType: '加減',
      value: 5,
      inputNumber: 10,
      outputNumber: 15,
    },
    resultPeriod: '114000124',
    predictionDistance: 1,
  };
}

const request: TiangongFilterRequest = {
  lottery: '今彩539', periodRange: 50, mode: 'one-stage', hitCondition: '準2進3',
  exploreDirections: ['固定'], firstStageDirections: ['固定'], firstRoadTypes: ['加減'],
};

describe('Tiangong artifact service', () => {
  it('filters one canonical eighty-period artifact for a fifty-period request', () => {
    const artifact = buildTiangongArtifact('今彩539', '114000123', [] as MatrixDraw[], () => [
      candidate({ sourceSequence: [1, 3, 5] }),
      candidate({
        sourceSequence: [31, 55, 79],
        firstStage: { startPosition: 1, direction: '固定', algorithmType: '加減', value: 5, nextN: 31 },
      }),
    ]);
    const result = filterTiangongArtifact(artifact, request);
    expect(result.total).toBe(1);
    expect(result.items[0]).toMatchObject({
      sourceSequence: [1, 3, 5], interval: 2, predictionDistance: 1, predictionNumber: '15',
    });
    expect(result.items[0]).not.toHaveProperty('sourceTriple');
    expect(JSON.stringify(result.items)).not.toContain('validationRows');
  });

  it('deduplicates complete identical results but retains different road identities with the same prediction', () => {
    const exact = candidate();
    const artifact = buildTiangongArtifact('今彩539', '114000123', [], () => [
      exact,
      structuredClone(exact),
      candidate({ firstStage: { startPosition: 1, direction: '固定', algorithmType: '合值', value: 25, nextN: 1 } }),
    ]);
    expect(artifact.items).toHaveLength(2);
    expect(new Set(artifact.items.map((item) => item.predictionNumber))).toEqual(new Set(['15']));
    expect(new Set(artifact.items.map((item) => item.roadType))).toEqual(new Set(['加減版路', '合值版路']));
  });

  it('sorts by interval then prediction distance and keeps validation detached behind item id', () => {
    const artifact = buildTiangongArtifact('今彩539', '114000123', [], () => [
      candidate({ sourceSequence: [1, 5, 9] }),
      candidate({
        sourceSequence: [1, 2, 3],
        firstStage: { startPosition: 1, direction: '固定', algorithmType: '加減', value: 6, nextN: 2 },
      }),
      candidate({ sourceSequence: [1, 2, 3], validationRows: [evidence()] }),
    ]);
    expect(artifact.items.map((item) => [item.interval, item.predictionDistance])).toEqual([[1, 1], [1, 2], [4, 1]]);
    const detail = getTiangongValidation(artifact, artifact.items[0].id);
    expect(detail?.validationRows).toEqual([evidence()]);
  });

  it('applies second-stage filters only in two-stage mode', () => {
    const artifact = buildTiangongArtifact('今彩539', '114000123', [], () => [candidate({
      mode: 'two-stage',
      secondStage: { startPosition: 2, direction: '依序遞增', algorithmType: '合值', value: 30, nextN: 1 },
    })]);
    expect(filterTiangongArtifact(artifact, {
      ...request, mode: 'two-stage', secondStageDirections: ['依序遞增'], secondRoadTypes: ['合值'],
    }).total).toBe(1);
    expect(filterTiangongArtifact(artifact, {
      ...request, mode: 'two-stage', secondStageDirections: ['固定'], secondRoadTypes: ['合值'],
    }).total).toBe(0);
  });
});
