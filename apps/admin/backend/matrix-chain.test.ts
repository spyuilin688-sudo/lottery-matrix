import { describe, expect, it } from 'vitest';
import { evaluateChain, CHAIN_STAGES, type StageEvidence } from './matrix-chain';
const at = '2026-09-19T16:00:00.000Z';
const stages = (): StageEvidence[] => CHAIN_STAGES.map(stage => ({stage,state:'PASS',source:'supabase',observedAt:at,period:'12004',code:'VERIFIED'}));
const report = (s = stages()) => evaluateChain({lottery:'天天樂',drawPeriod:'12004',checkedAt:at,stages:s});
describe('chain evidence', () => {
 it('reports a missing current card as a failed chain', () => {
  const missing = stages();
  missing.find(stage => stage.stage === 'card')!.state = 'FAIL';
  expect(report(missing).state).toBe('FAIL');
  expect(report(missing).stages.find(stage => stage.stage === 'card')?.state).toBe('FAIL');
 });
 it('requires every stage for the same period', () => {
  expect(report().state).toBe('PASS');
  expect(report(stages().slice(1)).state).toBe('UNKNOWN');
  const wrong = stages(); wrong[4].period = '12003'; expect(report(wrong).state).toBe('UNKNOWN');
 });
 it('never considers accepted recovery verified', () => {
  const s = stages(); s[4].state = 'WAITING'; s[4].code = 'RECOVERY_ACCEPTED'; expect(report(s).state).toBe('WAITING');
 });
 it('keeps a known failure despite unavailable evidence elsewhere', () => {
  const s = stages(); s[0].state = 'UNKNOWN'; s[4].state = 'FAIL'; expect(report(s).state).toBe('FAIL');
 });
 it('rejects duplicate and future evidence', () => {
  expect(report([...stages(),stages()[0]]).state).toBe('UNKNOWN');
  const s = stages(); s[0].observedAt='2099-01-01T00:00:00Z'; expect(report(s).state).toBe('UNKNOWN');
 });
});

it('does not mistake an old six-stage heartbeat for a verified card', () => {
 const current = ['schedule','job','crawler','draw','analysis','matrix-status'].map(stage => ({stage,state:'PASS',source:'supabase',observedAt:at,period:'12004',code:'VERIFIED'})) as StageEvidence[];
 expect(report(current).state).toBe('UNKNOWN');
 expect(report([...current,{stage:'custom-status',state:'FAIL',source:'legacy',observedAt:at,period:'12004',code:'CUSTOM_MISSING'} as unknown as StageEvidence]).state).toBe('UNKNOWN');
});
