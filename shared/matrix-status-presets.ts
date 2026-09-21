import ruleTemplates from '../services/matrix-api/app/domain/status-rules.json' with { type: 'json' };

export type MatrixLottery = '今彩539' | '天天樂' | '六合彩' | '大樂透';
export type MatrixNumberOrder = '依號碼由小到大排序' | '依實際開獎順序排序';
export type PresetStatus = 'ACTIVE' | 'FOCUS' | 'RESONANCE' | 'CRITICAL';
export type PresetRoadType = '加減' | '合值' | '拖牌' | '複合';
export type PresetConditionRow = {
  consecutiveMin: number;
  consecutiveMax: number;
  roadTypes: PresetRoadType[];
  roadRelation: 'any' | 'all';
  numberOrder: MatrixNumberOrder;
  sameCodeMin: number;
  sameCodeMax: number | null;
  roadTypeAlternatives?: PresetRoadType[][];
};
export type Chapter15Rule = {
  ruleId: string;
  status: PresetStatus;
  hitType: 'one-code' | 'two-code';
  rows: PresetConditionRow[];
  lotteryRows?: Partial<Record<MatrixLottery, PresetConditionRow[]>>;
};
export const chapter15Rules = ruleTemplates as Chapter15Rule[];
