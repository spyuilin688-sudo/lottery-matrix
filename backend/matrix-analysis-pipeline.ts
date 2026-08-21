import type { LotteryId } from '../shared/matrix-contracts';
import type { MatrixAnalysisKind } from '../shared/matrix-contracts';
import type { MatrixDraw, MatrixExploreGroupInput } from './matrix-algorithm';
import {
  matrixAnalysisProgressStore,
  type MatrixAnalysisJob,
} from './matrix-analysis-progress-store';
import { analysisStore, type AnalysisWriteMeta } from './matrix-analysis-store';
import {
  buildExploreArtifact,
  buildExploreGroupArtifact,
  createExploreWorkUnits,
  mergeExploreArtifacts,
  type ExploreArtifact,
} from './matrix-explore-service';
import { buildTianyanArtifact, type TianyanArtifact } from './matrix-tianyan-service';
import { buildTiangongArtifact, type TiangongArtifact } from './matrix-tiangong-service';

const DEFAULT_BATCH_BUDGET_MS = 22_000;

type ProgressStore = {
  getOrCreate(input: Omit<MatrixAnalysisJob, 'id' | 'phase' | 'cursor'>): Promise<MatrixAnalysisJob>;
  appendExploreGroup(
    job: MatrixAnalysisJob,
    unitIndex: number,
    artifact: unknown,
  ): Promise<MatrixAnalysisJob>;
  readExploreGroups(job: MatrixAnalysisJob): Promise<unknown[]>;
  setPhase(job: MatrixAnalysisJob, phase: MatrixAnalysisJob['phase']): Promise<MatrixAnalysisJob>;
  finish(job: MatrixAnalysisJob): Promise<void>;
};

type Dependencies = {
  getHistory(lottery: LotteryId, limit: number | null): Promise<MatrixDraw[]>;
  readAnalysis(
    kind: MatrixAnalysisKind,
    lottery: LotteryId,
    drawPeriod: string,
    analysisVersion?: string,
  ): Promise<unknown | null>;
  publishAnalysis(meta: AnalysisWriteMeta, data: unknown): Promise<unknown>;
  buildExplore(lottery: LotteryId, drawPeriod: string, history: MatrixDraw[]): ExploreArtifact;
  createExploreWorkUnits(lottery: LotteryId, history: MatrixDraw[]): MatrixExploreGroupInput[];
  buildExploreGroup(
    drawPeriod: string,
    history: MatrixDraw[],
    input: MatrixExploreGroupInput,
  ): ExploreArtifact;
  mergeExplore(lottery: LotteryId, drawPeriod: string, artifacts: ExploreArtifact[]): ExploreArtifact;
  buildTianyan(lottery: LotteryId, drawPeriod: string, explore: ExploreArtifact): TianyanArtifact;
  buildTiangong(lottery: LotteryId, drawPeriod: string, history: MatrixDraw[]): TiangongArtifact;
  progressStore: ProgressStore;
  now: () => Date;
  monotonicNow: () => number;
};

type EnsureCurrentOptions = {
  maxExploreGroups?: number;
  batchBudgetMs?: number;
};

const defaults: Dependencies = {
  getHistory: async (lottery, limit) => {
    const { getMatrixHistory } = await import('./scraper');
    return getMatrixHistory(lottery, limit) as Promise<MatrixDraw[]>;
  },
  publishAnalysis: (meta, data) => analysisStore.publishAnalysis(meta, data),
  readAnalysis: (kind, lottery, drawPeriod, analysisVersion) => (
    analysisStore.readAnalysis(kind, lottery, drawPeriod, analysisVersion)
  ),
  buildExplore: buildExploreArtifact,
  createExploreWorkUnits,
  buildExploreGroup: buildExploreGroupArtifact,
  mergeExplore: mergeExploreArtifacts,
  buildTianyan: buildTianyanArtifact,
  buildTiangong: buildTiangongArtifact,
  progressStore: matrixAnalysisProgressStore,
  now: () => new Date(),
  monotonicNow: () => Date.now(),
};

function storedData<T>(stored: unknown): T {
  if (
    stored
    && typeof stored === 'object'
    && 'data' in stored
  ) {
    return (stored as { data: T }).data;
  }
  return stored as T;
}

function artifactItemCount(stored: unknown) {
  const data = storedData<{ items?: unknown[] }>(stored);
  return Array.isArray(data?.items) ? data.items.length : 0;
}

export function createMatrixAnalysisPipeline(overrides: Partial<Dependencies> = {}) {
  const dependencies = { ...defaults, ...overrides };
  const pipeline = {
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
    async ensureCurrent(lottery: LotteryId, options: EnsureCurrentOptions = {}) {
      const history = await dependencies.getHistory(lottery, null);
      const drawPeriod = history[0]?.period;
      if (!drawPeriod) throw new Error('MATRIX_HISTORY_NOT_READY');
      const completed = await dependencies.readAnalysis('status', lottery, drawPeriod);
      if (completed) return { lottery, drawPeriod, skipped: true as const };

      const workUnits = dependencies.createExploreWorkUnits(lottery, history);
      const startedAt = dependencies.now().toISOString();
      let job = await dependencies.progressStore.getOrCreate({
        lottery,
        drawPeriod,
        analysisVersion: `${drawPeriod}:matrix-v2:${startedAt}`,
        startedAt,
        total: workUnits.length,
      });
      if (job.total !== workUnits.length) {
        throw new Error('MATRIX_ANALYSIS_WORK_UNIT_MISMATCH');
      }

      if (job.phase === 'explore') {
        const maxExploreGroups = Math.max(1, options.maxExploreGroups ?? Number.POSITIVE_INFINITY);
        const deadline = dependencies.monotonicNow()
          + Math.max(1, options.batchBudgetMs ?? DEFAULT_BATCH_BUDGET_MS);
        let completedThisInvocation = 0;
        while (
          job.cursor < job.total
          && completedThisInvocation < maxExploreGroups
          && (completedThisInvocation === 0 || dependencies.monotonicNow() < deadline)
        ) {
          const artifact = dependencies.buildExploreGroup(drawPeriod, history, workUnits[job.cursor]);
          job = await dependencies.progressStore.appendExploreGroup(job, job.cursor, artifact);
          completedThisInvocation += 1;
        }

        if (job.cursor < job.total) {
          return {
            lottery,
            drawPeriod,
            pending: true as const,
            phase: 'explore' as const,
            cursor: job.cursor,
            total: job.total,
          };
        }

        const groups = await dependencies.progressStore.readExploreGroups(job) as ExploreArtifact[];
        const explore = dependencies.mergeExplore(lottery, drawPeriod, groups);
        await dependencies.publishAnalysis({
          kind: 'explore',
          lottery,
          drawPeriod,
          analysisVersion: job.analysisVersion,
          startedAt: job.startedAt,
          completedAt: dependencies.now().toISOString(),
        }, explore);
        job = await dependencies.progressStore.setPhase(job, 'tianyan');
        return {
          lottery,
          drawPeriod,
          pending: true as const,
          phase: job.phase,
          cursor: job.cursor,
          total: job.total,
        };
      }

      if (job.phase === 'tianyan') {
        const storedExplore = await dependencies.readAnalysis(
          'explore', lottery, drawPeriod, job.analysisVersion,
        );
        if (!storedExplore) throw new Error('MATRIX_EXPLORE_ARTIFACT_NOT_READY');
        const tianyan = dependencies.buildTianyan(
          lottery,
          drawPeriod,
          storedData<ExploreArtifact>(storedExplore),
        );
        await dependencies.publishAnalysis({
          kind: 'tianyan',
          lottery,
          drawPeriod,
          analysisVersion: job.analysisVersion,
          startedAt: job.startedAt,
          completedAt: dependencies.now().toISOString(),
        }, tianyan);
        job = await dependencies.progressStore.setPhase(job, 'tiangong');
        return { lottery, drawPeriod, pending: true as const, phase: job.phase };
      }

      if (job.phase === 'tiangong') {
        const tiangong = dependencies.buildTiangong(lottery, drawPeriod, history);
        await dependencies.publishAnalysis({
          kind: 'tiangong',
          lottery,
          drawPeriod,
          analysisVersion: job.analysisVersion,
          startedAt: job.startedAt,
          completedAt: dependencies.now().toISOString(),
        }, tiangong);
        job = await dependencies.progressStore.setPhase(job, 'status');
        return { lottery, drawPeriod, pending: true as const, phase: job.phase };
      }

      const [storedExplore, storedTianyan, storedTiangong] = await Promise.all([
        dependencies.readAnalysis('explore', lottery, drawPeriod, job.analysisVersion),
        dependencies.readAnalysis('tianyan', lottery, drawPeriod, job.analysisVersion),
        dependencies.readAnalysis('tiangong', lottery, drawPeriod, job.analysisVersion),
      ]);
      if (!storedExplore || !storedTianyan || !storedTiangong) {
        throw new Error('MATRIX_ANALYSIS_ARTIFACTS_NOT_READY');
      }
      await dependencies.publishAnalysis({
        kind: 'status',
        lottery,
        drawPeriod,
        analysisVersion: job.analysisVersion,
        startedAt: job.startedAt,
        completedAt: dependencies.now().toISOString(),
      }, { artifactKinds: ['explore', 'tianyan', 'tiangong'] });
      await dependencies.progressStore.finish(job);
      return {
        lottery,
        drawPeriod,
        analysisVersion: job.analysisVersion,
        completed: true as const,
        exploreItems: artifactItemCount(storedExplore),
        tianyanItems: artifactItemCount(storedTianyan),
        tiangongItems: artifactItemCount(storedTiangong),
      };
    },
  };
  return pipeline;
}

export const matrixAnalysisPipeline = createMatrixAnalysisPipeline();
