import {
  normalizeCustomStatusConfig,
  validateCustomConfigRows,
  type CustomEntitlements,
  type CustomRoadType,
  type MatrixNumberOrder,
} from '../shared/matrix-status-config.ts';
import { groupRoads, matchingGroupRoads, type StatusRoad } from './matrix-status.ts';
export {
  normalizeCustomStatusConfig,
  createDefaultCustomStatusConfig,
  validateCustomConfigRows as validateCustomStatusConfig,
} from '../shared/matrix-status-config.ts';
export type {
  MatrixLottery, MatrixNumberOrder, CustomStatus, CustomRoadType, CustomConditionRow,
  CustomConditionGroup, CustomStatusConfig,
} from '../shared/matrix-status-config.ts';

// Legacy aggregate input remains supported at this public seam; production uses raw roads.
export type OneCodeConsecutive = '準4進5' | '準5進6' | '準6進7' | '準7進8';
export type TwoCodeConsecutive = '準5進6' | '準6進7' | '準7進8' | '準9進10' | '準11進12';
export type CustomConsecutive = OneCodeConsecutive | TwoCodeConsecutive;
export type CustomConditionMatch = {
  consecutive: CustomConsecutive;
  roadType: CustomRoadType;
  numberOrder: MatrixNumberOrder;
  sameCodeQuantity: number;
  hitType: 'one-code' | 'two-code';
  lockedCodeContributions: number;
  result: string[];
};

export function resolveStatusEvaluationMode(value: unknown, entitlements: CustomEntitlements) {
  if (!entitlements.canCustomizeStatus) {
    return { mode: 'chapter15' as const, reason: 'CUSTOMIZATION_NOT_ENTITLED' as const, preserved: true };
  }
  const config = normalizeCustomStatusConfig(value);
  return {
    mode: 'custom' as const,
    preserved: true,
    excludedGroupIds: [...config.oneCodeGroups, ...config.twoCodeGroups]
      .filter((group) => !entitlements.canUseCompositeCustomRoad
        && group.rows.some((row) => row.roadTypes.includes('複合')))
      .map((group) => group.id),
  };
}

export type CustomGroupResult = {
  groupId: string; hitType: StatusRoad['hitType']; result: string[]; roads: StatusRoad[];
};

export function evaluateCustomStatusRoads(value: unknown, roads: StatusRoad[]) {
  const validation = validateCustomConfigRows(value);
  if (!validation.ok) throw new Error(validation.code);
  const config = normalizeCustomStatusConfig(value);
  const matchedGroups: CustomGroupResult[] = [];
  for (const source of groupRoads(roads)) {
    const groups = source.hitType === 'one-code' ? config.oneCodeGroups : config.twoCodeGroups;
    for (const group of groups) {
      const witnesses = matchingGroupRoads(source.roads, group.rows);
      if (witnesses.length) matchedGroups.push({
        groupId: group.id, hitType: source.hitType, result: source.result, roads: witnesses,
      });
    }
  }
  return {
    lottery: config.lottery, status: config.status, triggered: matchedGroups.length > 0,
    matchedGroupIds: [...new Set(matchedGroups.map((match) => match.groupId))], matchedGroups,
  };
}

export function evaluateCustomStatus(config: unknown, matches: CustomConditionMatch[]) {
  const roads = new Map<string, StatusRoad>();
  for (const match of matches) {
    if (match.lockedCodeContributions !== (match.hitType === 'one-code' ? 1 : 2)) continue;
    const key = JSON.stringify([match.hitType, match.consecutive, match.roadType, match.numberOrder, [...match.result].sort()]);
    for (let index = 0; index < match.sameCodeQuantity; index += 1) {
      const id = `${key}:${index}`;
      roads.set(id, {
        id, hitType: match.hitType, result: match.result, algorithmType: match.roadType,
        numberOrder: match.numberOrder, streak: Number(/^準(\d+)進/.exec(match.consecutive)?.[1]),
        predictionDistance: 0, position: 0, lockedNumber: '', explorePeriods: 13,
      });
    }
  }
  const { matchedGroups: _matched, ...result } = evaluateCustomStatusRoads(config, [...roads.values()]);
  return result;
}
