import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'vite';

test('production loads feature pages and the card exporter on demand within the Vite size limit', async () => {
  const result = await build({ logLevel: 'silent', build: { write: false } });
  const chunks = result.output.filter((item) => item.type === 'chunk');
  const byName = new Map(chunks.map((chunk) => [chunk.fileName, chunk]));
  const initial = new Set();
  function visit(name) {
    if (initial.has(name)) return;
    initial.add(name);
    byName.get(name)?.imports.forEach(visit);
  }
  chunks.filter((chunk) => chunk.isEntry).forEach((chunk) => visit(chunk.fileName));
  for (const chunk of chunks) {
    assert.ok(Buffer.byteLength(chunk.code) <= 500_000, `${chunk.fileName} exceeds 500 KB`);
  }
  const initialModules = [...initial].flatMap((name) => Object.keys(byName.get(name)?.modules ?? {}));
  assert.ok(!initialModules.some((id) => /FeaturePages(?:Patched|Core)?\.tsx$|\/features\/.*Page|matrix-ticket-download\.ts$/.test(id)), 'feature pages/exporter must not enter the initial import graph');
  for (const name of ['MatrixExplorePage', 'MatrixTiangongPage', 'MatrixGuidePage', 'MemberPages', 'MatrixCardPage', 'matrix-ticket-download']) {
    assert.ok(chunks.some((chunk) => !initial.has(chunk.fileName) && Object.keys(chunk.modules).some((id) => id.includes(name))), `${name} must be deferred`);
  }
});
