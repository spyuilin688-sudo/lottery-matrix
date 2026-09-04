import { createCustomStatusStore } from '../../../backend/matrix-custom-status-store.ts';
import { createMemberAuth } from '../../../backend/matrix-member-auth.ts';
import type { ExploreArtifact, TianyanArtifact } from '../../../backend/matrix-status-service.ts';
import { createMatrixStatusEdgeHandler } from './handler.ts';
import {
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
const readStatusSources = createMatrixStatusSourceReader(loadConfig);
const readStatusValidation = createMatrixStatusValidationReader(loadConfig);

const handler = createMatrixStatusEdgeHandler({
  requireMember: (authorization) => memberAuth.requireMember(authorization),
  async readStatusSources(lottery: LotteryId, drawPeriod?: string) {
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
  },
  async readStatusValidation(lottery, drawPeriod, analysisVersion, itemId) {
    const source = await readStatusValidation(lottery, drawPeriod, analysisVersion, itemId);
    const sourceItemId = String(source.itemId ?? '').trim();
    if (!sourceItemId || source.validation == null) return null;
    return { itemId: sourceItemId, validation: source.validation };
  },
  listConfigs: (memberId) => customStatusStore.list(memberId),
});

Deno.serve(handler);
