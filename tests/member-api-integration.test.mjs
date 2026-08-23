import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const backend = await readFile(new URL('../backend/index.ts', import.meta.url), 'utf8');
const featurePages = await readFile(new URL('../src/FeaturePages.tsx', import.meta.url), 'utf8');

test('backend exposes authenticated member profile and notification settings routes', () => {
  assert.match(backend, /GET \/api\/member\/profile/);
  assert.match(backend, /GET \/api\/member\/notification-settings/);
  assert.match(backend, /PUT \/api\/member\/notification-settings/);
  assert.match(backend, /createMemberProfileRoutes/);
  assert.match(backend, /createMemberNotificationRoutes/);
});

test('notification and profile pages use the member API instead of fixed member data', () => {
  assert.match(featurePages, /fetchNotificationSettings/);
  assert.match(featurePages, /saveNotificationSettings/);
  assert.match(featurePages, /fetchMemberProfile/);
  assert.doesNotMatch(featurePages, /LINE ID：lottery_matrix/);
});
