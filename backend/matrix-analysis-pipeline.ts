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
const PERSISTENCE_RESERVE_MS = 7_000;

type ProgressStore = {
  getOrCreate(input: Omit<MatrixAnalysisJob, 'id' | 'phase' | 'cursor'>): Promise<MatrixAnalysisJob>;
  appendExploreGroups(
    job: MatrixAnalysisJob,
    unitIndex: number,
    artifacts: unknown[],
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
  reportStage?: (stage: string) => Promise<void>;
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

function logEnsureCurrentStage(
  lottery: LotteryId,
  stage: string,
  startedAt: number,
  details: Record<string, unknown> = {},
) {
  console.warn(`[matrix-analysis] ${JSON.stringify({
    lottery,
    stage,
    elapsedMs: Date.now() - startedAt,
    ...details,
  })}`);
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
      const diagnosticStartedAt = Date.now();
      const reportStage = options.reportStage ?? (async () => undefined);
      await reportStage('ensure-current:start');
      logEnsureCurrentStage(lottery, 'ensure-current:start', diagnosticStartedAt);
      await reportStage('history:start');
      logEnsureCurrentStage(lottery, 'history:start', diagnosticStartedAt);
      const history = await dependencies.getHistory(lottery, null);
      await reportStage(`history:complete:${history.length}`);
      logEnsureCurrentStage(lottery, 'history:complete', diagnosticStartedAt, {
        historyRows: history.length,
      });
      const drawPeriod = history[0]?.period;
      if (!drawPeriod) throw new Error('MATRIX_HISTORY_NOT_READY');
      const analysisVersion = `${drawPeriod}:matrix-v3`;
      const completed = await dependencies.readAnalysis(
        'status', lottery, drawPeriod, analysisVersion,
      );
      if (completed) {
        logEnsureCurrentStage(lottery, 'status:already-current', diagnosticStartedAt, {
          drawPeriod,
        });
        return { lottery, drawPeriod, skipped: true as const };
      }

      const workUnits = dependencies.createExploreWorkUnits(lottery, history);
      const startedAt = dependencies.now().toISOString();
      let job = await dependencies.progressStore.getOrCreate({
        lottery,
        drawPeriod,
        analysisVersion,
        startedAt,
        total: workUnits.length,
      });
      await reportStage(`job:ready:${job.phase}:${job.cursor}/${job.total}`);
      logEnsureCurrentStage(lottery, 'job:ready', diagnosticStartedAt, {
        drawPeriod,
        phase: job.phase,
        cursor: job.cursor,
        total: job.total,
      });
      if (job.total !== workUnits.length) {
        throw new Error('MATRIX_ANALYSIS_WORK_UNIT_MISMATCH');
      }

      if (job.phase === 'explore') {
        const maxExploreGroups = Math.max(1, options.maxExploreGroups ?? Number.POSITIVE_INFINITY);
        const batchBudgetMs = Math.max(1, options.batchBudgetMs ?? DEFAULT_BATCH_BUDGET_MS);
        const deadline = dependencies.monotonicNow()
          + Math.max(1, batchBudgetMs - PERSISTENCE_RESERVE_MS);
        let completedThisInvocation = 0;
        const firstUnitIndex = job.cursor;
        const artifacts: ExploreArtifact[] = [];
        logEnsureCurrentStage(lottery, 'explore:batch-start', diagnosticStartedAt, {
          firstUnitIndex,
          maxExploreGroups,
          batchBudgetMs,
        });
        while (
          firstUnitIndex + completedThisInvocation < job.total
          && completedThisInvocation < maxExploreGroups
          && (completedThisInvocation === 0 || dependencies.monotonicNow() < deadline)
        ) {
          const unitIndex = firstUnitIndex + completedThisInvocation;
          await reportStage(`explore:group-start:${unitIndex}`);
          logEnsureCurrentStage(lottery, 'explore:group-start', diagnosticStartedAt, {
            unitIndex,
          });
          artifacts.push(dependencies.buildExploreGroup(
            drawPeriod,
            history,
            workUnits[unitIndex],
          ));
          completedThisInvocation += 1;
          await reportStage(`explore:group-complete:${unitIndex}`);
          logEnsureCurrentStage(lottery, 'explore:group-complete', diagnosticStartedAt, {
            unitIndex,
          });
        }
        if (artifacts.length) {
          await reportStage(`explore:append-start:${firstUnitIndex}:${artifacts.length}`);
          logEnsureCurrentStage(lottery, 'explore:append-start', diagnosticStartedAt, {
            firstUnitIndex,
            artifactCount: artifacts.length,
          });
          job = await dependencies.progressStore.appendExploreGroups(
            job,
            firstUnitIndex,
            artifacts,
          );
          await reportStage(`explore:append-complete:${job.cursor}/${job.total}`);
          logEnsureCurrentStage(lottery, 'explore:append-complete', diagnosticStartedAt, {
            cursor: job.cursor,
            total: job.total,
          });
        }

        if (job.cursor < job.total) {
          logEnsureCurrentStage(lottery, 'explore:pending', diagnosticStartedAt, {
            cursor: job.cursor,
            total: job.total,
          });
          return {
            lottery,
            drawPeriod,
            pending: true as const,
            phase: 'explore' as const,
            cursor: job.cursor,
            total: job.total,
          };
        }

        await reportStage(`explore:read-groups-start:${job.cursor}`);
        logEnsureCurrentStage(lottery, 'explore:read-groups-start', diagnosticStartedAt, {
          groupCount: job.cursor,
        });
        const groups = await dependencies.progressStore.readExploreGroups(job) as ExploreArtifact[];
        await reportStage(`explore:read-groups-complete:${groups.length}`);
        logEnsureCurrentStage(lottery, 'explore:read-groups-complete', diagnosticStartedAt, {
          groupCount: groups.length,
        });
        const explore = dependencies.mergeExplore(lottery, drawPeriod, groups);
        await reportStage(`explore:publish-start:${explore.items.length}`);
        logEnsureCurrentStage(lottery, 'explore:publish-start', diagnosticStartedAt, {
          itemCount: explore.items.length,
        });
        await dependencies.publishAnalysis({
          kind: 'explore',
          lottery,
          drawPeriod,
          analysisVersion: job.analysisVersion,
          startedAt: job.startedAt,
          completedAt: dependencies.now().toISOString(),
        }, explore);
        await reportStage(`explore:publish-complete:${explore.items.length}`);
        logEnsureCurrentStage(lottery, 'explore:publish-complete', diagnosticStartedAt, {
          itemCount: explore.items.length,
        });
        job = await dependencies.progressStore.setPhase(job, 'tianyan');
        logEnsureCurrentStage(lottery, 'explore:phase-complete', diagnosticStartedAt, {
          nextPhase: job.phase,
        });
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
        await reportStage('tianyan:start');
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
        await reportStage('tianyan:complete');
        return { lottery, drawPeriod, pending: true as const, phase: job.phase };
      }

      if (job.phase === 'tiangong') {
        await reportStage('tiangong:start');
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
        await reportStage('tiangong:complete');
        return { lottery, drawPeriod, pending: true as const, phase: job.phase };
      }

      await reportStage('status:start');
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
      await reportStage('status:complete');
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
