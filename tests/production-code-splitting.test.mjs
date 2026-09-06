import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'vite';

test('production includes every feature page at startup and defers only the card exporter', async () => {
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
  const initialModules = [...initial].flatMap((name) => Object.keys(byName.get(name)?.modules ?? {}));
  for (const name of [
    'FeaturePagesPatched', 'FeaturePagesCore', 'MatrixExplorePage', 'MatrixTiangongPage',
    'LegacyTongXingPage', 'LegacyHistoryPage', 'NumberReferencePage', 'CalculatorPage',
    'MatrixCardPage', 'MatrixGuidePage', 'NotebookPages', 'LegacyNotificationsPage',
    'MemberPages', 'MatrixStatusPages',
  ]) {
    assert.ok(initialModules.some((id) => id.endsWith(`/${name}.tsx`)), `${name} must already be loaded before navigation`);
  }
  assert.ok(!initialModules.some((id) => id.endsWith('/matrix-ticket-download.ts')), 'the confirmed-download exporter remains deferred');
  assert.ok(chunks.some((chunk) => !initial.has(chunk.fileName) && Object.keys(chunk.modules).some((id) => id.endsWith('/matrix-ticket-download.ts'))));
});
