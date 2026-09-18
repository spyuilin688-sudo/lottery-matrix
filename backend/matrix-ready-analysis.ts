import type { LotteryId, MatrixAnalysisKind } from '../shared/matrix-contracts';

type CompletedArtifact = { analysisVersion: string; drawPeriod: string; data: unknown };
type Reader = (kind: MatrixAnalysisKind, lottery: LotteryId, drawPeriod?: string, analysisVersion?: string) => Promise<CompletedArtifact | null>;

export async function readReadyAnalysis(
  read: Reader,
  kind: Exclude<MatrixAnalysisKind, 'status'>,
  lottery: LotteryId,
  drawPeriod?: string,
) {
  const marker = await read('status', lottery, drawPeriod);
  const markerData = marker?.data && typeof marker.data === 'object' ? marker.data as { artifactKinds?: unknown } : {};
  if (!marker || !Array.isArray(markerData.artifactKinds) || !markerData.artifactKinds.includes(kind)) return null;
  const artifact = await read(kind, lottery, marker.drawPeriod, marker.analysisVersion);
  return artifact?.analysisVersion === marker.analysisVersion ? artifact : null;
}
