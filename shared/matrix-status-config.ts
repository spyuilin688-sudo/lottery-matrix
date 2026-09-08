import ruleTemplates from '../services/matrix-api/app/domain/status-rules.json' with { type: 'json' };

export type MatrixLottery = '今彩539' | '天天樂' | '六合彩' | '大樂透';
export type MatrixNumberOrder = '依號碼由小到大排序' | '依實際開獎順序排序';
export type CustomStatus = 'ACTIVE' | 'FOCUS' | 'RESONANCE' | 'CRITICAL';
export type CustomRoadType = '加減' | '合值' | '拖牌' | '複合';
export type CustomConditionRow = {
  consecutiveMin: number;
  consecutiveMax: number;
  roadTypes: CustomRoadType[];
  roadRelation: 'any' | 'all';
  numberOrder: MatrixNumberOrder;
  sameCodeMin: number;
  sameCodeMax: number | null;
  roadTypeAlternatives?: CustomRoadType[][];
};
export type CustomConditionGroup = { id: string; rows: CustomConditionRow[] };
export type CustomStatusConfig = {
  schemaVersion: 2;
  lottery: MatrixLottery;
  status: CustomStatus;
  explorePeriods: 13;
  exploreRange: '完整範圍';
  oneCodeGroups: CustomConditionGroup[];
  twoCodeGroups: CustomConditionGroup[];
};
export type CustomEntitlements = { canCustomizeStatus: boolean; canUseCompositeCustomRoad: boolean };
export type CustomConfigValidation = { ok: true } | { ok: false; code: string; path: string };
export type Chapter15Rule = {
  ruleId: string; status: CustomStatus; hitType: 'one-code' | 'two-code'; rows: CustomConditionRow[];
};
export const chapter15Rules = ruleTemplates as Chapter15Rule[];
export const customRoadTypes: CustomRoadType[] = ['加減', '合值', '拖牌', '複合'];
export const oneCodeStreaks = [4, 5, 6, 7];
export const twoCodeStreaks = [5, 6, 7, 9, 11];
const numberOrders: MatrixNumberOrder[] = ['依號碼由小到大排序', '依實際開獎順序排序'];
const lotteries: MatrixLottery[] = ['今彩539', '天天樂', '六合彩', '大樂透'];
const statuses: CustomStatus[] = ['ACTIVE', 'FOCUS', 'RESONANCE', 'CRITICAL'];

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('INVALID_REQUEST');
  return value as Record<string, unknown>;
}

function normalizeRow(value: unknown, legacy: boolean): CustomConditionRow {
  const row = record(value);
  if (!legacy) return { ...row } as CustomConditionRow;
  const match = typeof row.consecutive === 'string' ? /^準(\d+)進(\d+)$/.exec(row.consecutive) : null;
  const streak = match && Number(match[2]) === Number(match[1]) + 1 ? Number(match[1]) : NaN;
  return {
    consecutiveMin: streak, consecutiveMax: streak,
    roadTypes: [row.roadType as CustomRoadType], roadRelation: 'any',
    numberOrder: row.numberOrder as MatrixNumberOrder,
    sameCodeMin: row.sameCodeQuantity as number, sameCodeMax: null,
  };
}

/** Upgrade old records in memory; their minimum quantity remains unbounded above. */
export function normalizeCustomStatusConfig(value: unknown): CustomStatusConfig {
  const config = record(value);
  if (config.schemaVersion !== undefined && config.schemaVersion !== 1 && config.schemaVersion !== 2) {
    throw new Error('INVALID_SCHEMA_VERSION');
  }
  const groups = (value: unknown): CustomConditionGroup[] => {
    if (!Array.isArray(value)) throw new Error('INVALID_REQUEST');
    return value.map((value) => {
      const group = record(value);
      if (!Array.isArray(group.rows)) throw new Error('INVALID_REQUEST');
      return {
        id: group.id as string,
        rows: group.rows.map((row) => normalizeRow(row, config.schemaVersion !== 2)),
      };
    });
  };
  return {
    schemaVersion: 2,
    lottery: config.lottery as MatrixLottery,
    status: config.status as CustomStatus,
    explorePeriods: config.explorePeriods as 13,
    exploreRange: config.exploreRange as '完整範圍',
    oneCodeGroups: groups(config.oneCodeGroups),
    twoCodeGroups: groups(config.twoCodeGroups),
  };
}

export function customRowKey(row: CustomConditionRow) {
  const types = [...row.roadTypes].sort();
  const alternatives = row.roadTypeAlternatives?.map((types) => [...types].sort().join('|')).sort();
  return JSON.stringify([row.consecutiveMin, row.consecutiveMax, types, row.roadRelation,
    row.numberOrder, row.sameCodeMin, row.sameCodeMax, alternatives ?? null]);
}

export function validateCustomConfigRows(
  value: unknown,
  entitlements?: CustomEntitlements,
): CustomConfigValidation {
  const invalid = (code: string, path: string): CustomConfigValidation => ({ ok: false, code, path });
  if (entitlements && !entitlements.canCustomizeStatus) return invalid('CUSTOMIZATION_NOT_ENTITLED', 'config');
  let config: CustomStatusConfig;
  try { config = normalizeCustomStatusConfig(value); }
  catch (error) { return invalid(error instanceof Error ? error.message : 'INVALID_REQUEST', 'config'); }
  if (!lotteries.includes(config.lottery)) return invalid('INVALID_LOTTERY', 'lottery');
  if (!statuses.includes(config.status)) return invalid('INVALID_STATUS', 'status');
  if (config.explorePeriods !== 13) return invalid('INVALID_EXPLORE_PERIODS', 'explorePeriods');
  if (config.exploreRange !== '完整範圍') return invalid('INVALID_EXPLORE_RANGE', 'exploreRange');
  const ids = new Set<string>();
  for (const root of ['oneCodeGroups', 'twoCodeGroups'] as const) {
    const groups = config[root];
    const streaks = root === 'oneCodeGroups' ? oneCodeStreaks : twoCodeStreaks;
    if (groups.length > 20) return invalid('TOO_MANY_GROUPS', root);
    for (const [groupIndex, group] of groups.entries()) {
      const path = `${root}.${groupIndex}`;
      if (typeof group.id !== 'string' || !group.id.trim() || ids.has(group.id)) return invalid('INVALID_GROUP_ID', `${path}.id`);
      ids.add(group.id);
      if (group.rows.length < 1 || group.rows.length > 10) return invalid('TOO_MANY_ROWS', `${path}.rows`);
      const keys = new Set<string>();
      for (const [rowIndex, row] of group.rows.entries()) {
        const rowPath = `${path}.rows.${rowIndex}`;
        if (!streaks.includes(row.consecutiveMin) || !streaks.includes(row.consecutiveMax)
          || row.consecutiveMin > row.consecutiveMax) return invalid('INVALID_CONSECUTIVE', `${rowPath}.consecutiveMin`);
        if (!Array.isArray(row.roadTypes) || !row.roadTypes.length
          || row.roadTypes.some((type) => !customRoadTypes.includes(type))
          || new Set(row.roadTypes).size !== row.roadTypes.length) return invalid('INVALID_ROAD_TYPE', `${rowPath}.roadTypes`);
        if (row.roadRelation !== 'any' && row.roadRelation !== 'all') return invalid('INVALID_ROAD_RELATION', `${rowPath}.roadRelation`);
        if (!numberOrders.includes(row.numberOrder)) return invalid('INVALID_NUMBER_ORDER', `${rowPath}.numberOrder`);
        const quantity = (count: unknown) => typeof count === 'number' && Number.isInteger(count) && count >= 1 && count <= 99;
        if (!quantity(row.sameCodeMin) || (row.sameCodeMax !== null
          && (!quantity(row.sameCodeMax) || row.sameCodeMax < row.sameCodeMin))) return invalid('INVALID_SAME_CODE_QUANTITY', `${rowPath}.sameCodeMin`);
        if (row.roadTypeAlternatives !== undefined) {
          const alternatives = row.roadTypeAlternatives;
          if (row.roadRelation !== 'all' || !Array.isArray(alternatives) || !alternatives.length
            || alternatives.some((types) => !Array.isArray(types) || !types.length
              || types.some((type) => !row.roadTypes.includes(type)) || new Set(types).size !== types.length)) {
            return invalid('INVALID_ROAD_ALTERNATIVES', `${rowPath}.roadTypeAlternatives`);
          }
          const sets = alternatives.map((types) => [...types].sort().join('|'));
          if (new Set(sets).size !== sets.length || new Set(alternatives.flat()).size !== row.roadTypes.length) {
            return invalid('INVALID_ROAD_ALTERNATIVES', `${rowPath}.roadTypeAlternatives`);
          }
        }
        if (entitlements && !entitlements.canUseCompositeCustomRoad && row.roadTypes.includes('複合')) {
          return invalid('COMPOSITE_NOT_ENTITLED', `${rowPath}.roadTypes`);
        }
        const key = customRowKey(row);
        if (keys.has(key)) return invalid('DUPLICATE_ROW', rowPath);
        keys.add(key);
      }
    }
  }
  return { ok: true };
}

export function createDefaultCustomStatusConfig(lottery: MatrixLottery, status: CustomStatus): CustomStatusConfig {
  const groups = (hitType: Chapter15Rule['hitType']) => chapter15Rules
    .filter((rule) => rule.status === status && rule.hitType === hitType)
    .map((rule) => ({ id: rule.ruleId, rows: structuredClone(rule.rows) }));
  return {
    schemaVersion: 2, lottery, status, explorePeriods: 13, exploreRange: '完整範圍',
    oneCodeGroups: groups('one-code'), twoCodeGroups: groups('two-code'),
  };
}

export function defaultCustomRow(hitType: 'one' | 'two'): CustomConditionRow {
  return {
    consecutiveMin: hitType === 'one' ? 4 : 5, consecutiveMax: hitType === 'one' ? 4 : 5,
    roadTypes: ['加減'], roadRelation: 'any', numberOrder: '依號碼由小到大排序',
    sameCodeMin: 1, sameCodeMax: null,
  };
}
