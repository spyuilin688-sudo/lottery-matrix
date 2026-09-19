import type { CustomStatusConfig, MatrixLottery } from './matrix-custom-status.ts';
import {
  buildMatrixCustomStatusResult,
  type MatrixCustomStatusResult,
  type MatrixCustomStatusSource,
} from './matrix-custom-status-result.ts';

type ResultStore = {
  save(
    memberId: string,
    lottery: MatrixLottery,
    result: MatrixCustomStatusResult,
  ): Promise<void>;
  reset(memberId: string, lottery: MatrixLottery): Promise<void>;
};

type Dependencies = {
  readStatusSources(lottery: MatrixLottery): Promise<MatrixCustomStatusSource | null>;
  listConfigs(memberId: string): Promise<CustomStatusConfig[]>;
  listConfigsByLottery(lottery: MatrixLottery): Promise<Array<{
    memberId: string;
    configs: CustomStatusConfig[];
  }>>;
  resultStore: ResultStore;
};

function requireSource(source: MatrixCustomStatusSource | null, expectedPeriod?: string) {
  if (!source?.analysisVersion || !source.drawPeriod || !source.explore || !source.tianyan) {
    throw new Error('ANALYSIS_NOT_READY');
  }
  if (expectedPeriod && source.drawPeriod !== expectedPeriod) throw new Error('RECOVERY_SUPERSEDED');
  return source;
}

export function createMatrixCustomStatusRecomputeService(dependencies: Dependencies) {
  return {
    async recomputeMember(memberId: string, lottery: MatrixLottery, expectedPeriod?: string) {
      const configs = (await dependencies.listConfigs(memberId))
        .filter((config) => config.lottery === lottery);
      if (configs.length === 0) {
        await dependencies.resultStore.reset(memberId, lottery);
        return { lottery, memberId, updated: false, removed: true };
      }
      const source = requireSource(await dependencies.readStatusSources(lottery), expectedPeriod);
      const result = buildMatrixCustomStatusResult(source, configs);
      await dependencies.resultStore.save(memberId, lottery, result);
      return {
        lottery,
        memberId,
        updated: true,
        removed: false,
        drawPeriod: result.drawPeriod,
        analysisVersion: result.analysisVersion,
      };
    },

    async recomputeLottery(lottery: MatrixLottery, expectedPeriod?: string) {
      const members = await dependencies.listConfigsByLottery(lottery);
      if (members.length === 0) return { lottery, updated: 0, ...(expectedPeriod ? {drawPeriod:expectedPeriod} : {}) };
      const source = requireSource(await dependencies.readStatusSources(lottery), expectedPeriod);
      for (const member of members) {
        const result = buildMatrixCustomStatusResult(source, member.configs);
        await dependencies.resultStore.save(member.memberId, lottery, result);
      }
      return {
        lottery,
        updated: members.length,
        drawPeriod: source.drawPeriod,
        analysisVersion: source.analysisVersion,
      };
    },
  };
}
