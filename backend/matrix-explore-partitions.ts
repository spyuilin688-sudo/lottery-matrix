import type { LotteryId } from '../shared/matrix-contracts';
import type {
  MatrixAlgorithmType,
  MatrixExploreGroupInput,
  MatrixNumberOrder,
} from './matrix-algorithm';
import type { MatrixAnalysisJob } from './matrix-analysis-progress-store';
import type { ExploreArtifact } from './matrix-explore-service';

export const PARTITIONED_EXPLORE_FORMAT = 'matrix-explore-partitioned-v1' as const;

type PartitionDescriptor = Pick<
  MatrixExploreGroupInput,
  'numberOrder' | 'algorithmType' | 'lockedSourceIndex' | 'lockedPosition'
> & { index: number };

type ProgressReference = Pick<
  MatrixAnalysisJob,
  'id' | 'lottery' | 'drawPeriod' | 'analysisVersion' | 'startedAt' | 'phase' | 'cursor' | 'total'
>;

export type PartitionedExploreArtifact = ExploreArtifact & {
  partitioned: {
    format: typeof PARTITIONED_EXPLORE_FORMAT;
    job: ProgressReference;
    partitions: PartitionDescriptor[];
  };
};

type PartitionRequest = {
  numberOrder: MatrixNumberOrder;
  roadTypes: MatrixAlgorithmType[];
  explorePeriods: 2 | 7 | 13;
};

export function createPartitionedExploreArtifact(
  lottery: LotteryId,
  drawPeriod: string,
  job: MatrixAnalysisJob,
  workUnits: MatrixExploreGroupInput[],
): PartitionedExploreArtifact {
  if (job.cursor !== job.total || workUnits.length !== job.total) {
    throw new Error('MATRIX_EXPLORE_PARTITIONS_INCOMPLETE');
  }
  return {
    lottery,
    drawPeriod,
    items: [],
    validationById: {},
    partitioned: {
      format: PARTITIONED_EXPLORE_FORMAT,
      job: {
        id: job.id,
        lottery: job.lottery,
        drawPeriod: job.drawPeriod,
        analysisVersion: job.analysisVersion,
        startedAt: job.startedAt,
        phase: job.phase,
        cursor: job.cursor,
        total: job.total,
      },
      partitions: workUnits.map((unit, index) => ({
        index,
        numberOrder: unit.numberOrder,
        algorithmType: unit.algorithmType,
        lockedSourceIndex: unit.lockedSourceIndex,
        lockedPosition: unit.lockedPosition,
      })),
    },
  };
}

export function isPartitionedExploreArtifact(
  artifact: ExploreArtifact,
): artifact is PartitionedExploreArtifact {
  return 'partitioned' in artifact
    && (artifact as Partial<PartitionedExploreArtifact>).partitioned?.format
      === PARTITIONED_EXPLORE_FORMAT;
}

export function partitionIndexesForRequest(
  artifact: PartitionedExploreArtifact,
  request: PartitionRequest,
) {
  return artifact.partitioned.partitions
    .filter((partition) => (
      partition.numberOrder === request.numberOrder
      && request.roadTypes.includes(partition.algorithmType)
      && partition.lockedSourceIndex < request.explorePeriods
    ))
    .map((partition) => partition.index);
}

export function partitionIndexForItemId(
  artifact: PartitionedExploreArtifact,
  itemId: string,
) {
  const [numberOrder, sourceIndex, lockedPosition, , , algorithmType] = itemId.split('|');
  const partition = artifact.partitioned.partitions.find((candidate) => (
    candidate.numberOrder === numberOrder
    && candidate.lockedSourceIndex === Number(sourceIndex)
    && candidate.lockedPosition === Number(lockedPosition)
    && candidate.algorithmType === algorithmType
  ));
  return partition?.index ?? null;
}
