export type LotteryId = '今彩539' | '天天樂' | '六合彩' | '大樂透';

export type MatrixAnalysisKind = 'explore' | 'tianyan' | 'tiangong' | 'status';

export type MatrixAnalysisMeta = {
  kind: MatrixAnalysisKind;
  lottery: LotteryId;
  drawPeriod: string;
  analysisVersion: string;
};

export type MatrixCompletedEnvelope<T> = MatrixAnalysisMeta & {
  status: 'complete';
  data: T;
};

export type MatrixListEnvelope<T> = MatrixCompletedEnvelope<{
  items: T[];
  total: number;
}>;

export type MatrixValidationEnvelope<T> = MatrixCompletedEnvelope<{
  itemId: string;
  validation: T;
}>;

export type MatrixFailureCode =
  | 'AUTH_REQUIRED'
  | 'FORBIDDEN'
  | 'ANALYSIS_NOT_READY'
  | 'ANALYSIS_VERSION_MISMATCH'
  | 'INVALID_REQUEST';

export function completedEnvelope<T>(
  kind: MatrixAnalysisKind,
  lottery: LotteryId,
  drawPeriod: string,
  analysisVersion: string,
  data: T,
): MatrixCompletedEnvelope<T> {
  return {
    kind,
    lottery,
    drawPeriod,
    analysisVersion,
    status: 'complete',
    data,
  };
}
