import { describe, expect, it } from 'vitest';
import type { ExploreArtifact, ExploreArtifactRow } from './matrix-explore-service';
import {
  buildTianyanArtifact,
  filterTianyanArtifact,
  getTianyanValidation,
} from './matrix-tianyan-service';

function exploreRow(id: string, prediction: string, position: number, algorithmType: '加減' | '合值'):
  ExploreArtifactRow {
  return {
    id,
    number: '07',
    lockedPosition: 1,
    predictionDistance: 1,
    consecutive: '準9進10',
    highestStreak: 9,
    predictionNumbers: [prediction],
    algorithmType,
    numberOrder: '依號碼由小到大排序',
    explorePeriods: 13,
    exploreDateOffset: 0,
    ruleCount: 1,
    referenceOffset: -1,
    referencePosition: position,
  };
}

function validation(id: string, position: number, algorithmType: '加減' | '合值', hits: boolean[]) {
  return {
    itemId: id,
    sourceA: { baseNumber: position === 1 ? 3 : 10 },
    ruleSets: [{
      rules: [{ id: `${id}-rule`, referenceOffset: -1, referencePosition: position, algorithmType, value: algorithmType === '合值' ? 13 : 0 }],
      predictionNumbers: position === 1 ? [3] : [15],
      historicalValidation: hits.map((success, index) => ({
        group: `g${index + 1}`,
        sourcePeriod: String(100 - index),
        predictionPeriod: String(101 - index),
        predictionNumbers: [],
        baseNumber: position,
        success,
      })),
    }],
  };
}

function sourceArtifact(): ExploreArtifact {
  const firstHits = [true, true, true, false, false, false, true, true, true];
  const secondHits = [false, false, false, true, true, true, true, true, true];
  return {
    lottery: '今彩539',
    drawPeriod: '114000123',
    items: [
      exploreRow('a', '03', 1, '加減'),
      exploreRow('a-duplicate', '03', 1, '加減'),
      exploreRow('b', '15', 2, '合值'),
      exploreRow('c', '03', 3, '加減'),
    ],
    validationById: {
      a: validation('a', 1, '加減', firstHits),
      'a-duplicate': validation('a-duplicate', 1, '加減', firstHits),
      b: validation('b', 2, '合值', secondHits),
      c: validation('c', 3, '加減', secondHits),
    },
  };
}

describe('Tianyan artifact service', () => {
  it('builds fixed composite/two-code rows, deduplicates identical pairs, and detaches validation', () => {
    const artifact = buildTianyanArtifact('今彩539', '114000123', sourceArtifact());
    const filtered = filterTianyanArtifact(artifact, ['準9進10']);

    expect(filtered.items).toHaveLength(2);
    expect(filtered.items[0]).toMatchObject({
      roadType: '複合',
      hitCondition: '準5+（鎖定2碼）',
      consecutive: '準9進10',
      numberOrder: '依號碼由小到大排序',
      explorePeriods: 13,
      exploreDateOffset: 0,
    });
    expect(JSON.stringify(filtered.items)).not.toContain('historicalValidation');
  });

  it('preserves different rule identities even when the final prediction numbers match', () => {
    const artifact = buildTianyanArtifact('今彩539', '114000123', sourceArtifact());
    const validations = artifact.items.map((item) => getTianyanValidation(artifact, item.id));
    expect(validations).toHaveLength(2);
    expect(validations[0]?.rules).not.toEqual(validations[1]?.rules);
  });

  it('only combines rules from the same locked source condition', () => {
    const source = sourceArtifact();
    const items = [
      { ...source.items[0], lockedSourceIndex: 0, lockedSourcePeriod: '114000123' },
      { ...source.items[2], lockedSourceIndex: 1, lockedSourcePeriod: '114000122' },
    ];
    const artifact = buildTianyanArtifact('今彩539', '114000123', {
      ...source,
      items,
      validationById: {
        [items[0].id]: source.validationById[items[0].id],
        [items[1].id]: source.validationById[items[1].id],
      },
    });

    expect(artifact.items).toEqual([]);
  });
});
