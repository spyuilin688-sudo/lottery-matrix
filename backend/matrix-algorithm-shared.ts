export type MatrixLottery = '今彩539' | '天天樂' | '六合彩' | '大樂透';

export type MatrixNumberOrder = '依號碼由小到大排序' | '依實際開獎順序排序';

export type MatrixAlgorithmType = '加減' | '合值' | '拖牌';

export type MatrixDraw = {
  lottery?: MatrixLottery;
  period: string;
  drawDate: string;
  numbers: string[];
  sortedNumbers?: string[];
  drawOrderNumbers?: string[] | null;
};

export type MatrixExploreGroupInput = {
  lottery: MatrixLottery;
  numberOrder: MatrixNumberOrder;
  algorithmType: MatrixAlgorithmType;
  lockedSourceIndex: number;
  lockedPosition: number;
  exploreDateOffset: 0 | 1 | 2;
  exploreRange: '完整範圍';
  predictionDistance: number;
};

export function normalizeMatrixNumber(value: number, maxNumber: number) {
  return ((value - 1) % maxNumber + maxNumber) % maxNumber + 1;
}
