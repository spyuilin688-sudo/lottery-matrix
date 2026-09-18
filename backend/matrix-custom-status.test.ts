import { describe, expect, it } from 'vitest';
import {
  evaluateCustomStatus,
  resolveStatusEvaluationMode,
  validateCustomStatusConfig,
  type CustomConditionGroup,
  type CustomConditionMatch,
  type CustomStatusConfig,
} from './matrix-custom-status';

const row = (overrides: Record<string, unknown> = {}) => ({
  consecutive: '準4進5',
  roadType: '加減',
  numberOrder: '依號碼由小到大排序',
  sameCodeQuantity: 2,
  ...overrides,
});

function group(id: string, rows = [row()]): CustomConditionGroup {
  return { id, rows: rows as CustomConditionGroup['rows'] };
}

function config(overrides: Partial<CustomStatusConfig> = {}): CustomStatusConfig {
  return {
    lottery: '今彩539',
    status: 'ACTIVE',
    explorePeriods: 13,
    exploreRange: '完整範圍',
    oneCodeGroups: [group('one-1')],
    twoCodeGroups: [],
    ...overrides,
  };
}

describe('custom Matrix status validation', () => {
  it.each(['今彩539', '天天樂', '六合彩', '大樂透'] as const)('accepts independent %s configuration', (lottery) => {
    expect(validateCustomStatusConfig(config({ lottery }), { canCustomizeStatus: true, canUseCompositeCustomRoad: false })).toEqual({ ok: true });
  });

  it.each(['ACTIVE', 'FOCUS', 'RESONANCE', 'CRITICAL'] as const)('accepts independent %s configuration', (status) => {
    expect(validateCustomStatusConfig(config({ status }), { canCustomizeStatus: true, canUseCompositeCustomRoad: false })).toEqual({ ok: true });
  });

  it('fixes exploration to thirteen periods and full range', () => {
    expect(validateCustomStatusConfig({ ...config(), explorePeriods: 7 as 13 }, { canCustomizeStatus: true, canUseCompositeCustomRoad: false })).toMatchObject({ ok: false, code: 'INVALID_EXPLORE_PERIODS' });
    expect(validateCustomStatusConfig({ ...config(), exploreRange: '標準範圍' as '完整範圍' }, { canCustomizeStatus: true, canUseCompositeCustomRoad: false })).toMatchObject({ ok: false, code: 'INVALID_EXPLORE_RANGE' });
  });

  it('enforces the exact one-code and two-code consecutive choices', () => {
    for (const consecutive of ['準4進5', '準5進6', '準6進7', '準7進8']) {
      expect(validateCustomStatusConfig(config({ oneCodeGroups: [group('one', [row({ consecutive })])] }), { canCustomizeStatus: true, canUseCompositeCustomRoad: false })).toEqual({ ok: true });
    }
    for (const consecutive of ['準5進6', '準6進7', '準7進8', '準9進10', '準11進12']) {
      const two = row({ consecutive, sameCodeQuantity: 1 });
      expect(validateCustomStatusConfig(config({ oneCodeGroups: [], twoCodeGroups: [group('two', [two])] }), { canCustomizeStatus: true, canUseCompositeCustomRoad: false })).toEqual({ ok: true });
    }
    expect(validateCustomStatusConfig(config({ oneCodeGroups: [group('one', [row({ consecutive: '準9進10' })])] }), { canCustomizeStatus: true, canUseCompositeCustomRoad: false })).toMatchObject({ ok: false, code: 'INVALID_CONSECUTIVE' });
  });

  it('rejects duplicate rows only within the same group while allowing identical complete groups', () => {
    expect(validateCustomStatusConfig(config({ oneCodeGroups: [group('one', [row(), row()])] }), { canCustomizeStatus: true, canUseCompositeCustomRoad: false })).toMatchObject({ ok: false, code: 'DUPLICATE_ROW' });
    expect(validateCustomStatusConfig(config({ oneCodeGroups: [group('one-a'), group('one-b')] }), { canCustomizeStatus: true, canUseCompositeCustomRoad: false })).toEqual({ ok: true });
  });

  it('limits each hit type to twenty groups and each group to ten rows', () => {
    const groups = Array.from({ length: 21 }, (_, index) => group(`g-${index}`));
    expect(validateCustomStatusConfig(config({ oneCodeGroups: groups }), { canCustomizeStatus: true, canUseCompositeCustomRoad: false })).toMatchObject({ ok: false, code: 'TOO_MANY_GROUPS' });
    expect(validateCustomStatusConfig(config({ oneCodeGroups: [group('one', Array.from({ length: 11 }, (_, index) => row({ sameCodeQuantity: index + 1 })))] }), { canCustomizeStatus: true, canUseCompositeCustomRoad: false })).toMatchObject({ ok: false, code: 'TOO_MANY_ROWS' });
  });

  it('requires an integer same-code quantity from 1 through 99', () => {
    for (const sameCodeQuantity of [0, 1.5, 100]) {
      expect(validateCustomStatusConfig(config({ oneCodeGroups: [group('one', [row({ sameCodeQuantity })])] }), { canCustomizeStatus: true, canUseCompositeCustomRoad: false })).toMatchObject({ ok: false, code: 'INVALID_SAME_CODE_QUANTITY' });
    }
  });

  it('allows composite only for quarterly-or-above entitlement and preserves saved config on downgrade', () => {
    const composite = config({ oneCodeGroups: [group('one', [row({ roadType: '複合' })])] });
    expect(validateCustomStatusConfig(composite, { canCustomizeStatus: true, canUseCompositeCustomRoad: true })).toEqual({ ok: true });
    expect(validateCustomStatusConfig(composite, { canCustomizeStatus: true, canUseCompositeCustomRoad: false })).toMatchObject({ ok: false, code: 'COMPOSITE_NOT_ENTITLED' });
    expect(resolveStatusEvaluationMode(composite, { canCustomizeStatus: true, canUseCompositeCustomRoad: false })).toEqual({
      mode: 'custom', preserved: true, excludedGroupIds: ['one'],
    });
  });

  it('excludes only the composite-containing group after a downgrade', () => {
    const mixed = config({ oneCodeGroups: [group('plain'), group('composite', [row({ roadType: '複合' })])] });
    expect(resolveStatusEvaluationMode(mixed, { canCustomizeStatus: true, canUseCompositeCustomRoad: false })).toEqual({
      mode: 'custom', preserved: true, excludedGroupIds: ['composite'],
    });
  });

  it('preserves but does not apply expired-member configuration', () => {
    expect(resolveStatusEvaluationMode(config(), { canCustomizeStatus: false, canUseCompositeCustomRoad: false })).toEqual({ mode: 'chapter15', reason: 'CUSTOMIZATION_NOT_ENTITLED', preserved: true });
  });
});

describe('custom Matrix status evaluation', () => {
  const match = (overrides: Partial<CustomConditionMatch> = {}): CustomConditionMatch => ({
    hitType: 'one-code',
    consecutive: '準4進5',
    roadType: '加減',
    numberOrder: '依號碼由小到大排序',
    sameCodeQuantity: 2,
    lockedCodeContributions: 1,
    result: ['08'],
    ...overrides,
  });

  it('uses AND for rows in one group and OR across groups', () => {
    const custom = config({ oneCodeGroups: [group('and', [row(), row({ roadType: '合值' })]), group('or', [row({ roadType: '拖牌' })])] });
    expect(evaluateCustomStatus(custom, [match()])).toMatchObject({ triggered: false, matchedGroupIds: [] });
    expect(evaluateCustomStatus(custom, [match({ roadType: '拖牌' })])).toMatchObject({ triggered: true, matchedGroupIds: ['or'] });
    expect(evaluateCustomStatus(custom, [match(), match({ roadType: '合值' })])).toMatchObject({ triggered: true, matchedGroupIds: ['and'] });
  });

  it('requires one contribution for one-code and two contributions for two-code even when both predict the same code', () => {
    const twoRow = row({ consecutive: '準5進6', sameCodeQuantity: 1 });
    const custom = config({ oneCodeGroups: [], twoCodeGroups: [group('two', [twoRow])] });
    expect(evaluateCustomStatus(custom, [match({ hitType: 'two-code', consecutive: '準5進6', sameCodeQuantity: 1, lockedCodeContributions: 1, result: ['08'] })]).triggered).toBe(false);
    expect(evaluateCustomStatus(custom, [match({ hitType: 'two-code', consecutive: '準5進6', sameCodeQuantity: 1, lockedCodeContributions: 2, result: ['08'] })])).toMatchObject({ triggered: true, matchedGroupIds: ['two'] });
    expect(evaluateCustomStatus(custom, [match({ hitType: 'two-code', consecutive: '準5進6', sameCodeQuantity: 1, lockedCodeContributions: 3, result: ['08'] })]).triggered).toBe(false);
  });

  it('returns the exact selected lottery and status for direct homepage replacement', () => {
    expect(evaluateCustomStatus(config({ lottery: '六合彩', status: 'CRITICAL' }), [match()])).toMatchObject({ lottery: '六合彩', status: 'CRITICAL', triggered: true });
  });
});
