import type { LotteryId, MatrixAnalysisKind } from '../shared/matrix-contracts';

type CompletedArtifact = {
  kind?: MatrixAnalysisKind;
  analysisVersion: string;
  drawPeriod: string;
  data: unknown;
  [key: string]: unknown;
};

type Reader = (
  kind: MatrixAnalysisKind,
  lottery: LotteryId,
  drawPeriod?: string,
) => Promise<CompletedArtifact | null>;

export async function readStoredStatusExplore(
  readAnalysis: Reader,
  lottery: LotteryId,
  drawPeriod?: string,
) {
  const marker = await readAnalysis('status', lottery, drawPeriod);
  const data = marker?.data && typeof marker.data === 'object'
    ? marker.data as { artifactKinds?: unknown; explore?: unknown }
    : {};
  if (
    !marker
    || !Array.isArray(data.artifactKinds)
    || !data.artifactKinds.includes('explore')
    || !data.explore
  ) return null;
  const explore = data.explore as { lottery?: unknown; drawPeriod?: unknown };
  if (explore.lottery !== lottery || explore.drawPeriod !== marker.drawPeriod) return null;
  return { ...marker, kind: 'explore' as const, data: data.explore };
}
