import assert from 'node:assert/strict';
import test from 'node:test';

let reader = {};
try {
  reader = await import('../backend/matrix-analysis-progress-reader.ts');
} catch {
  reader = {};
}

test('reads every Explore group with one current-format round trip and one legacy fallback', async () => {
  assert.equal(typeof reader.readExploreGroupArtifacts, 'function');

  const calls = [];
  const storage = {
    async read(paths) {
      calls.push(paths);
      return paths.map((path) => ({
        path,
        content: path.endsWith('.json.gz')
          ? Number(path.match(/\/(\d+)\.json\.gz$/)?.[1]) % 2 === 0
            ? null
            : `current:${Number(path.match(/\/(\d+)\.json\.gz$/)?.[1])}`
          : JSON.stringify({ index: Number(path.match(/\/(\d+)\.json$/)?.[1]) }),
      }));
    },
  };
  const paths = Array.from({ length: 25 }, (_, index) => `groups/${index}.json.gz`);
  const legacyPaths = Array.from({ length: 25 }, (_, index) => `groups/${index}.json`);

  const artifacts = await reader.readExploreGroupArtifacts(
    storage,
    paths,
    legacyPaths,
    async (value) => ({ index: Number(value.replace('current:', '')) }),
    (value) => JSON.parse(value),
  );

  assert.deepEqual(artifacts, Array.from({ length: 25 }, (_, index) => ({ index })));
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0], paths);
  assert.deepEqual(calls[1], legacyPaths.filter((_, index) => index % 2 === 0));
});
