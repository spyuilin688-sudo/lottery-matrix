import type { MatrixLottery, MatrixNumberOrder } from './matrix-algorithm';
import type { MatrixEntitlements } from './matrix-entitlements';
import type { MatrixStatus } from './matrix-status';

export type CustomStatus = Exclude<MatrixStatus, 'DORMANT'>;
export type CustomRoadType = '加減' | '合值' | '拖牌' | '複合';
export type OneCodeConsecutive = '準4進5' | '準5進6' | '準6進7' | '準7進8';
export type TwoCodeConsecutive = '準5進6' | '準6進7' | '準7進8' | '準9進10' | '準11進12';
export type CustomConsecutive = OneCodeConsecutive | TwoCodeConsecutive;

export type CustomConditionRow = {
  consecutive: CustomConsecutive;
  roadType: CustomRoadType;
  numberOrder: MatrixNumberOrder;
  sameCodeQuantity: number;
};

export type CustomConditionGroup = {
  id: string;
  rows: CustomConditionRow[];
};

export type CustomStatusConfig = {
  lottery: MatrixLottery;
  status: CustomStatus;
  explorePeriods: 13;
  exploreRange: '完整範圍';
  oneCodeGroups: CustomConditionGroup[];
  twoCodeGroups: CustomConditionGroup[];
};

export type CustomConditionMatch = CustomConditionRow & {
  hitType: 'one-code' | 'two-code';
  lockedCodeContributions: number;
  result: string[];
};

type CustomEntitlements = Pick<MatrixEntitlements, 'canCustomizeStatus' | 'canUseCompositeCustomRoad'>;
type ValidationResult = { ok: true } | { ok: false; code: string; path: string };

const lotteries: MatrixLottery[] = ['今彩539', '天天樂', '六合彩', '大樂透'];
const statuses: CustomStatus[] = ['ACTIVE', 'FOCUS', 'RESONANCE', 'CRITICAL'];
const roadTypes: CustomRoadType[] = ['加減', '合值', '拖牌', '複合'];
const numberOrders: MatrixNumberOrder[] = ['依號碼由小到大排序', '依實際開獎順序排序'];
const oneCodeConsecutives: CustomConsecutive[] = ['準4進5', '準5進6', '準6進7', '準7進8'];
const twoCodeConsecutives: CustomConsecutive[] = ['準5進6', '準6進7', '準7進8', '準9進10', '準11進12'];

function invalid(code: string, path: string): ValidationResult {
  return { ok: false, code, path };
}

function rowKey(row: CustomConditionRow) {
  return [row.consecutive, row.roadType, row.numberOrder, row.sameCodeQuantity].join('|');
}

function validateGroups(
  groups: CustomConditionGroup[],
  hitType: 'one-code' | 'two-code',
  entitlements: CustomEntitlements,
): ValidationResult {
  const root = hitType === 'one-code' ? 'oneCodeGroups' : 'twoCodeGroups';
  const allowedConsecutives = hitType === 'one-code' ? oneCodeConsecutives : twoCodeConsecutives;
  if (!Array.isArray(groups) || groups.length > 20) return invalid('TOO_MANY_GROUPS', root);
  for (let groupIndex = 0; groupIndex < groups.length; groupIndex += 1) {
    const group = groups[groupIndex];
    const groupPath = `${root}.${groupIndex}`;
    if (!group || !Array.isArray(group.rows) || group.rows.length < 1 || group.rows.length > 10) {
      return invalid('TOO_MANY_ROWS', `${groupPath}.rows`);
    }
    const seen = new Set<string>();
    for (let rowIndex = 0; rowIndex < group.rows.length; rowIndex += 1) {
      const row = group.rows[rowIndex];
      const path = `${groupPath}.rows.${rowIndex}`;
      if (!allowedConsecutives.includes(row.consecutive)) return invalid('INVALID_CONSECUTIVE', `${path}.consecutive`);
      if (!roadTypes.includes(row.roadType)) return invalid('INVALID_ROAD_TYPE', `${path}.roadType`);
      if (!numberOrders.includes(row.numberOrder)) return invalid('INVALID_NUMBER_ORDER', `${path}.numberOrder`);
      if (!Number.isInteger(row.sameCodeQuantity) || row.sameCodeQuantity < 1 || row.sameCodeQuantity > 99) {
        return invalid('INVALID_SAME_CODE_QUANTITY', `${path}.sameCodeQuantity`);
      }
      if (row.roadType === '複合' && !entitlements.canUseCompositeCustomRoad) {
        return invalid('COMPOSITE_NOT_ENTITLED', `${path}.roadType`);
      }
      const key = rowKey(row);
      if (seen.has(key)) return invalid('DUPLICATE_ROW', path);
      seen.add(key);
    }
  }
  return { ok: true };
}

export function validateCustomStatusConfig(config: CustomStatusConfig, entitlements: CustomEntitlements): ValidationResult {
  if (!entitlements.canCustomizeStatus) return invalid('CUSTOMIZATION_NOT_ENTITLED', 'config');
  if (!lotteries.includes(config.lottery)) return invalid('INVALID_LOTTERY', 'lottery');
  if (!statuses.includes(config.status)) return invalid('INVALID_STATUS', 'status');
  if (config.explorePeriods !== 13) return invalid('INVALID_EXPLORE_PERIODS', 'explorePeriods');
  if (config.exploreRange !== '完整範圍') return invalid('INVALID_EXPLORE_RANGE', 'exploreRange');
  const one = validateGroups(config.oneCodeGroups, 'one-code', entitlements);
  if (!one.ok) return one;
  return validateGroups(config.twoCodeGroups, 'two-code', entitlements);
}

function eligibleGroups(config: CustomStatusConfig, entitlements: CustomEntitlements) {
  const all = [...config.oneCodeGroups, ...config.twoCodeGroups];
  return entitlements.canUseCompositeCustomRoad
    ? all
    : all.filter((group) => group.rows.every((row) => row.roadType !== '複合'));
}

export function resolveStatusEvaluationMode(config: CustomStatusConfig, entitlements: CustomEntitlements) {
  if (!entitlements.canCustomizeStatus) {
    return { mode: 'chapter15' as const, reason: 'CUSTOMIZATION_NOT_ENTITLED' as const, preserved: true };
  }
  const eligible = eligibleGroups(config, entitlements);
  return {
    mode: 'custom' as const,
    preserved: true,
    excludedGroupIds: [...config.oneCodeGroups, ...config.twoCodeGroups]
      .filter((group) => !eligible.includes(group))
      .map((group) => group.id),
  };
}

function rowMatches(row: CustomConditionRow, hitType: CustomConditionMatch['hitType'], match: CustomConditionMatch) {
  const requiredContributions = hitType === 'one-code' ? 1 : 2;
  return match.hitType === hitType
    && match.lockedCodeContributions === requiredContributions
    && match.consecutive === row.consecutive
    && match.roadType === row.roadType
    && match.numberOrder === row.numberOrder
    && match.sameCodeQuantity >= row.sameCodeQuantity;
}

export function evaluateCustomStatus(config: CustomStatusConfig, matches: CustomConditionMatch[]) {
  const matchedGroupIds: string[] = [];
  const sections: Array<[CustomConditionGroup[], CustomConditionMatch['hitType']]> = [
    [config.oneCodeGroups, 'one-code'],
    [config.twoCodeGroups, 'two-code'],
  ];
  for (const [groups, hitType] of sections) {
    for (const group of groups) {
      if (group.rows.every((condition) => matches.some((match) => rowMatches(condition, hitType, match)))) {
        matchedGroupIds.push(group.id);
      }
    }
  }
  return {
    lottery: config.lottery,
    status: config.status,
    triggered: matchedGroupIds.length > 0,
    matchedGroupIds,
  };
}
