import type { MatrixExploreGroupInput } from './matrix-algorithm';
import type { ExploreArtifact } from './matrix-explore-service';
import type { TianyanArtifact } from './matrix-tianyan-service';

export type TianyanPartitionWorkUnit = { indexes: number[] };

export type TianyanPartitionArtifact = {
  explore: ExploreArtifact;
  tianyan: TianyanArtifact;
};

export function createTianyanPartitionWorkUnits(
  workUnits: MatrixExploreGroupInput[],
): TianyanPartitionWorkUnit[] {
  const grouped = new Map<string, number[]>();
  workUnits.forEach((unit, index) => {
    const key = [unit.numberOrder, unit.lockedSourceIndex, unit.lockedPosition].join('|');
    const indexes = grouped.get(key) ?? [];
    indexes.push(index);
    grouped.set(key, indexes);
  });
  return [...grouped.values()].map((indexes) => ({ indexes }));
}

export function compactExploreArtifact(artifact: ExploreArtifact): ExploreArtifact {
  return { ...artifact, validationById: {} };
}
