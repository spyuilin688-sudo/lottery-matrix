import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync('backend/matrix-tools.ts', 'utf8');

test('Matrix 同星探索結果以舊資料在上、新資料在下輸出', () => {
  const body = source.match(/export async function runTongXing\([\s\S]*?\n}\n\nexport async function runNumberReference/)?.[0] ?? '';
  assert.match(body, /return \{ lottery, numberOrder, numbers, futureOffset, groups: \[\.\.\.groups\]\.reverse\(\) \};/);
});
