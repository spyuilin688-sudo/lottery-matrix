import { createCustomStatusStore } from '../../../backend/matrix-custom-status-store.ts';
import { createCustomStatusResultStore } from '../../../backend/matrix-custom-status-result-store.ts';
import { createMatrixCustomStatusRecomputeService } from '../../../backend/matrix-custom-status-recompute.ts';
import { createMemberAuth } from '../../../backend/matrix-member-auth.ts';
import type { ExploreArtifact, TianyanArtifact } from '../../../backend/matrix-status-service.ts';
import { createMatrixStatusEdgeHandler } from './handler.ts';
import {
  createMatrixStatusCompactReader,
  createMatrixStatusIdentityReader,
  createMatrixStatusSourceReader,
  createMatrixStatusValidationReader,
} from './source-reader.ts';

type LotteryId = '今彩539' | '天天樂' | '六合彩' | '大樂透';

function requiredEnvironment(name: string) {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error('SUPABASE_CONFIG_MISSING');
  return value;
}

function loadConfig() {
  return {
    url: requiredEnvironment('SUPABASE_URL').replace(/\/+$/, ''),
    anonKey: requiredEnvironment('SUPABASE_ANON_KEY'),
    serviceRoleKey: requiredEnvironment('SUPABASE_SERVICE_ROLE_KEY'),
  };
}

const memberAuth = createMemberAuth(loadConfig);
const customStatusStore = createCustomStatusStore(loadConfig);
const customStatusResultStore = createCustomStatusResultStore(loadConfig);
const readStatusIdentity = createMatrixStatusIdentityReader(loadConfig);
const readCompactStatus = createMatrixStatusCompactReader(loadConfig);
const readStatusSources = createMatrixStatusSourceReader(loadConfig);
const readStatusValidation = createMatrixStatusValidationReader(loadConfig);

async function resolvedStatusIdentity(lottery: LotteryId, drawPeriod?: string) {
  const identity = await readStatusIdentity(lottery, drawPeriod);
  if (!identity) return null;
  const analysisVersion = String(identity.analysisVersion ?? '').trim();
  const resolvedPeriod = String(identity.drawPeriod ?? '').trim();
  if (!analysisVersion || !resolvedPeriod) return null;
  return { analysisVersion, drawPeriod: resolvedPeriod };
}

async function resolvedStatusSources(lottery: LotteryId, drawPeriod?: string) {
  const source = await readStatusSources(lottery, drawPeriod);
  if (!source) return null;
  const analysisVersion = String(source.analysisVersion ?? '').trim();
  const resolvedPeriod = String(source.drawPeriod ?? '').trim();
  if (!analysisVersion || !resolvedPeriod || !source.explore || !source.tianyan) return null;
  return {
    analysisVersion,
    drawPeriod: resolvedPeriod,
    explore: source.explore as ExploreArtifact,
    tianyan: source.tianyan as TianyanArtifact,
  };
}

const customStatusRecompute = createMatrixCustomStatusRecomputeService({
  readStatusSources: (lottery) => resolvedStatusSources(lottery),
  listConfigs: (memberId) => customStatusStore.list(memberId),
  listConfigsByLottery: (lottery) => customStatusStore.listByLottery(lottery),
  resultStore: customStatusResultStore,
});

const handler = createMatrixStatusEdgeHandler({
  requireMember: (authorization) => memberAuth.requireMember(authorization),
  customStatusStore,
  readStatusIdentity: resolvedStatusIdentity,
  async readCompactStatus(lottery: LotteryId, drawPeriod?: string) {
    const source = await readCompactStatus(lottery, drawPeriod);
    if (!source) return null;
    const analysisVersion = String(source.analysisVersion ?? '').trim();
    const resolvedPeriod = String(source.drawPeriod ?? '').trim();
    const payload = source.payload;
    if (
      !analysisVersion
      || !resolvedPeriod
      || !payload
      || typeof payload !== 'object'
      || Array.isArray(payload)
    ) return null;
    return {
      analysisVersion,
      drawPeriod: resolvedPeriod,
      payload: payload as Record<string, unknown>,
    };
  },
  readCustomStatus: (memberId, lottery, drawPeriod) => (
    customStatusResultStore.read(memberId, lottery, drawPeriod)
  ),
  readStatusSources: resolvedStatusSources,
  async readStatusValidation(lottery, drawPeriod, analysisVersion, itemId) {
    const source = await readStatusValidation(lottery, drawPeriod, analysisVersion, itemId);
    const sourceItemId = String(source.itemId ?? '').trim();
    if (!sourceItemId || source.validation == null) return null;
    return { itemId: sourceItemId, validation: source.validation };
  },
  listConfigs: (memberId) => customStatusStore.list(memberId),
  authorizeInternal: (authorization) => (
    authorization === `Bearer ${loadConfig().serviceRoleKey}`
  ),
  recomputeMember: (memberId, lottery, expectedPeriod) => (
    customStatusRecompute.recomputeMember(memberId, lottery, expectedPeriod)
  ),
  recomputeLottery: (lottery, expectedPeriod) => customStatusRecompute.recomputeLottery(lottery, expectedPeriod),
});

Deno.serve(handler);
