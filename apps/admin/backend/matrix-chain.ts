import type { WatchdogLottery } from './watchdog';
export const CHAIN_STAGES = ['schedule','job','crawler','draw','analysis','matrix-status','card'] as const;
export type ChainStage = typeof CHAIN_STAGES[number];
export type StageState = 'PASS' | 'FAIL' | 'WAITING' | 'UNKNOWN';
export type StageEvidence = { stage: ChainStage; state: StageState; source: string; observedAt: string; period: string | null; code: string };
export type ChainReport = { lottery: WatchdogLottery; drawPeriod: string | null; checkedAt: string; state: StageState; stages: StageEvidence[] };
const states: StageState[] = ['PASS','FAIL','WAITING','UNKNOWN'];
export function evaluateChain(input: Omit<ChainReport,'state'>): ChainReport {
 const checked = Date.parse(input.checkedAt);
 const stages = CHAIN_STAGES.map(stage => {
  const found = input.stages.filter(s => s.stage === stage);
  const evidence = found[0];
  if (found.length !== 1 || !evidence || !states.includes(evidence.state)
   || !Number.isFinite(Date.parse(evidence.observedAt)) || Date.parse(evidence.observedAt) > checked + 120_000
   || (evidence.state === 'PASS' && (!input.drawPeriod || evidence.period !== input.drawPeriod))) {
   return {stage,state:'UNKNOWN' as const,source:'watchdog',observedAt:input.checkedAt,period:input.drawPeriod,code:'EVIDENCE_UNAVAILABLE'};
  }
  return evidence;
 });
 return {...input, stages, state: stages.some(s => s.state === 'FAIL') ? 'FAIL' : stages.some(s => s.state === 'UNKNOWN') ? 'UNKNOWN' : stages.some(s => s.state === 'WAITING') ? 'WAITING' : 'PASS'};
}
export function sanitizeChainReports(value: unknown): ChainReport[] {
 if (!Array.isArray(value)) return [];
 const seen = new Set<string>();
 return value.slice(0,4).flatMap(raw => {
  if (!raw || !['今彩539','天天樂','六合彩','大樂透'].includes(raw.lottery) || seen.has(raw.lottery) || !Number.isFinite(Date.parse(raw.checkedAt))) return [];
  seen.add(raw.lottery);
  const safe = (s: unknown, max = 100) => typeof s === 'string' ? s.slice(0,max) : '';
  return [evaluateChain({lottery:raw.lottery,drawPeriod:safe(raw.drawPeriod,40) || null,checkedAt:new Date(raw.checkedAt).toISOString(),stages:(Array.isArray(raw.stages)?raw.stages:[]).slice(0,14).filter((s: StageEvidence) => s && CHAIN_STAGES.includes(s.stage)).map((s: StageEvidence) => ({stage:s.stage,state:s.state,source:safe(s.source,80),code:safe(s.code,80),period:safe(s.period,40)||null,observedAt:safe(s.observedAt,40)}))})];
 });
}
