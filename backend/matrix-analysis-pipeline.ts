import type { LotteryId } from '../shared/matrix-contracts';
import type { MatrixDraw } from './matrix-algorithm';
import { analysisStore, type AnalysisWriteMeta } from './matrix-analysis-store';
import { buildExploreArtifact, type ExploreArtifact } from './matrix-explore-service';
import { buildTianyanArtifact, type TianyanArtifact } from './matrix-tianyan-service';
import { buildTiangongArtifact, type TiangongArtifact } from './matrix-tiangong-service';

type Dependencies = {
  getHistory(lottery: LotteryId, limit: number | null): Promise<MatrixDraw[]>;
  publishAnalysis(meta: AnalysisWriteMeta, data: unknown): Promise<unknown>;
  buildExplore(lottery: LotteryId, drawPeriod: string, history: MatrixDraw[]): ExploreArtifact;
  buildTianyan(lottery: LotteryId, drawPeriod: string, explore: ExploreArtifact): TianyanArtifact;
  buildTiangong(lottery: LotteryId, drawPeriod: string, history: MatrixDraw[]): TiangongArtifact;
  now: () => Date;
};

const defaults: Dependencies = {
  getHistory: async (lottery, limit) => {
    const { getMatrixHistory } = await import('./scraper');
    return getMatrixHistory(lottery, limit) as Promise<MatrixDraw[]>;
  },
  publishAnalysis: (meta, data) => analysisStore.publishAnalysis(meta, data),
  buildExplore: buildExploreArtifact,
  buildTianyan: buildTianyanArtifact,
  buildTiangong: buildTiangongArtifact,
  now: () => new Date(),
};

export function createMatrixAnalysisPipeline(overrides: Partial<Dependencies> = {}) {
  const dependencies = { ...defaults, ...overrides };
  return {
    async run(lottery: LotteryId) {
      const startedAt = dependencies.now().toISOString();
      const history = await dependencies.getHistory(lottery, null);
      const drawPeriod = history[0]?.period;
      if (!drawPeriod) throw new Error('MATRIX_HISTORY_NOT_READY');
      const analysisVersion = `${drawPeriod}:matrix-v1:${startedAt}`;
      const explore = dependencies.buildExplore(lottery, drawPeriod, history);
      const tianyan = dependencies.buildTianyan(lottery, drawPeriod, explore);
      const tiangong = dependencies.buildTiangong(lottery, drawPeriod, history);
      const exploreCompletedAt = dependencies.now().toISOString();
      await dependencies.publishAnalysis({
        kind: 'explore', lottery, drawPeriod, analysisVersion, startedAt, completedAt: exploreCompletedAt,
      }, explore);
      await dependencies.publishAnalysis({
        kind: 'tianyan', lottery, drawPeriod, analysisVersion, startedAt, completedAt: dependencies.now().toISOString(),
      }, tianyan);
      await dependencies.publishAnalysis({
        kind: 'tiangong', lottery, drawPeriod, analysisVersion, startedAt, completedAt: dependencies.now().toISOString(),
      }, tiangong);
      await dependencies.publishAnalysis({
        kind: 'status', lottery, drawPeriod, analysisVersion, startedAt, completedAt: dependencies.now().toISOString(),
      }, { artifactKinds: ['explore', 'tianyan', 'tiangong'] });
      return {
        lottery,
        drawPeriod,
        analysisVersion,
        exploreItems: explore.items.length,
        tianyanItems: tianyan.items.length,
        tiangongItems: tiangong.items.length,
      };
    },
  };
}

export const matrixAnalysisPipeline = createMatrixAnalysisPipeline();
