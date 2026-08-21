type StorageReader = {
  read(paths: string[]): Promise<Array<{ path: string; content: string | null }>>;
};

export async function readExploreGroupArtifacts(
  storage: StorageReader,
  paths: string[],
  legacyPaths: string[],
  decodeCurrent: (value: string) => Promise<unknown>,
  decodeLegacy: (value: string) => unknown,
) {
  const stored = await storage.read(paths);
  if (stored.length !== paths.length) throw new Error('MATRIX_ANALYSIS_PROGRESS_INCOMPLETE');

  const missingIndexes = stored.flatMap((file, index) => file.content === null ? [index] : []);
  const legacy = missingIndexes.length
    ? await storage.read(missingIndexes.map((index) => legacyPaths[index]))
    : [];
  if (legacy.some((file) => file.content === null)) {
    throw new Error('MATRIX_ANALYSIS_PROGRESS_INCOMPLETE');
  }

  const legacyByIndex = new Map(missingIndexes.map((index, legacyIndex) => (
    [index, String(legacy[legacyIndex]?.content)]
  )));
  return Promise.all(stored.map((file, index) => (
    file.content === null
      ? decodeLegacy(String(legacyByIndex.get(index)))
      : decodeCurrent(file.content)
  )));
}
