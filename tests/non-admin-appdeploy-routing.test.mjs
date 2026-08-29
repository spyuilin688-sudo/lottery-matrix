import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const resolved = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await sourceFiles(resolved));
    else if (/\.(?:ts|tsx|js|jsx)$/.test(entry.name)) files.push(resolved);
  }
  return files;
}

test('non-admin frontend runtime never targets AppDeploy', async () => {
  const files = await sourceFiles('src');
  const offenders = [];
  for (const file of files) {
    const content = await readFile(file, 'utf8');
    if (/appdeploy(?:\.ai|\.com)/i.test(content)) offenders.push(file);
  }
  assert.deepEqual(offenders, []);
});

test('shared Matrix API client targets the Railway API base', async () => {
  const content = await readFile('src/matrix-api-client.ts', 'utf8');
  assert.match(content, /VITE_RAILWAY_API_BASE/);
  assert.doesNotMatch(content, /LEGACY_MATRIX_API_BASE/);
});
