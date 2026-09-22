import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const bridge = readFileSync(new URL('../src/auth/MemberSessionBridge.tsx', import.meta.url), 'utf8');
const memberPages = readFileSync(new URL('../src/features/MemberPages.tsx', import.meta.url), 'utf8');
const paymentHistory = readFileSync(new URL('../src/features/use-payment-history.ts', import.meta.url), 'utf8');

test('MemberSessionBridge is the sole persistent member-page Supabase session owner', () => {
  assert.match(bridge, /auth\.getSession\(\)/);
  assert.match(bridge, /auth\.onAuthStateChange\(/);
  for (const [name, source] of [['MemberPages', memberPages], ['payment history', paymentHistory]]) {
    assert.doesNotMatch(source, /\.auth\.getSession\(/, name + ' must consume the shared member session snapshot');
    assert.doesNotMatch(source, /\.auth\.onAuthStateChange\(/, name + ' must not install a second auth listener');
  }
});
