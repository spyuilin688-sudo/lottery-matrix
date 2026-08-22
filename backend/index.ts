import { router, json, error, secrets } from '@appdeploy/sdk';
import { backfillRange, backfillSourceRange, backfillYear, completeHistoricalSource, fetchSource, getHistoricalMaintenanceStatus, getMatrixAudit, getMatrixCoverage, getMatrixHistory, getMatrixLatest, inspectBrightstreamHistory, inspectBrightstreamMarkSixDeep, inspectHkHistoryCandidates, inspectLotto8HistoryOnly, inspectNfdDatabaseFiles, inspectNfdLotto8HistoryMap, inspectNfdNativeDateSources, listRecords, refreshActiveSources } from './scraper';

import { notifySubscribers, realtimeSubscriptionRoutes } from './realtime-subscribers';
import { runMatrixAlgorithmCaseChecks } from './matrix-algorithm-cases';
import { runNumberReference, runTongXing } from './matrix-tools';
import { analysisStore } from './matrix-analysis-store';
import { analysisVersionForDrawPeriod } from './matrix-analysis-version';
import { createMemberAuth } from './matrix-member-auth';
import { createMatrixExploreRoutes } from './matrix-explore-routes';
import {
    enrichExploreValidationReferenceNumbers,
    filterExploreArtifact,
    type ExploreArtifact,
    type ExploreFilterRequest,
} from './matrix-explore-service';
import { createMatrixTianyanRoutes } from './matrix-tianyan-routes';
import type { TianyanArtifact } from './matrix-tianyan-service';
import { createMatrixTiangongRoutes } from './matrix-tiangong-routes';
import type { TiangongArtifact } from './matrix-tiangong-service';
import { createCustomStatusStore } from './matrix-custom-status-store';
import { createMatrixCustomStatusRoutes } from './matrix-custom-status-routes';
import { createMatrixStatusRoutes } from './matrix-status-routes';
import { matrixAnalysisPipeline } from './matrix-analysis-pipeline';
import { matrixAnalysisProgressStore } from './matrix-analysis-progress-store';
import {
    isPartitionedExploreArtifact,
    partitionIndexForItemId,
    partitionIndexesForRequest,
} from './matrix-explore-partitions';
import { isTaipeiRefreshWindow, matrixWorkerLimits, runRefreshThenAnalysis, selectAnalysisLottery } from './matrix-analysis-cron';
import { readReadyAnalysis } from './matrix-ready-analysis';
import { createSystemJobStatusWriter, createSystemJobTracker } from './system-job-status';
import { createMemberOnlineRpc, createMemberOnlineService } from './member-online';

async function loadMatrixSupabaseConfig() {
    const names = await secrets.listSecretNames();
    const required = ['SUPABASE_URL','SUPABASE_ANON_KEY','SUPABASE_SERVICE_ROLE_KEY'];
    if (!required.every(name => names.includes(name))) throw new Error('SUPABASE_CONFIG_MISSING');
    const [url,anonKey,serviceRoleKey] = await Promise.all(required.map(name => secrets.readSecret(name)));
    if (!url?.trim() || !anonKey?.trim() || !serviceRoleKey?.trim()) throw new Error('SUPABASE_CONFIG_MISSING');
    return { url:url.trim().replace(/\/+$/,''),anonKey:anonKey.trim(),serviceRoleKey:serviceRoleKey.trim() };
}

const matrixMemberAuth = createMemberAuth(loadMatrixSupabaseConfig);
const memberOnlineService = createMemberOnlineService(createMemberOnlineRpc(loadMatrixSupabaseConfig));
const systemJobTracker = createSystemJobTracker(createSystemJobStatusWriter(loadMatrixSupabaseConfig));
const matrixCustomStatusStore = createCustomStatusStore(loadMatrixSupabaseConfig);
const matrixCustomStatusRoutes = createMatrixCustomStatusRoutes({
    requireMember: authorization => matrixMemberAuth.requireMember(authorization),
    store: matrixCustomStatusStore,
});
const readCompletedMatrixAnalysis = (kind: 'explore'|'tianyan'|'tiangong',lottery: '今彩539'|'天天樂'|'六合彩'|'大樂透',drawPeriod?: string) =>
    readReadyAnalysis((analysisKind,analysisLottery,analysisPeriod,analysisVersion) => analysisStore.readAnalysis(analysisKind,analysisLottery,analysisPeriod,analysisVersion),kind,lottery,drawPeriod);
async function filterStoredExploreArtifact(
    artifact: ExploreArtifact,
    request: ExploreFilterRequest,
    entitlements: Parameters<typeof filterExploreArtifact>[2],
) {
    if (!isPartitionedExploreArtifact(artifact)) {
        return filterExploreArtifact(artifact, request, entitlements);
    }
    const indexes = partitionIndexesForRequest(artifact, request);
    const items: ExploreArtifact['items'] = [];
    for (let index = 0; index < indexes.length; index += 4) {
        const groups = await matrixAnalysisProgressStore.readExploreGroupIndexes(
            artifact.partitioned.job,
            indexes.slice(index, index + 4),
        ) as ExploreArtifact[];
        for (const group of groups) {
            const filtered = filterExploreArtifact(
                group,
                { ...request, sameCode: false },
                entitlements,
            );
            items.push(...filtered.items);
        }
    }
    return filterExploreArtifact({
        lottery: artifact.lottery,
        drawPeriod: artifact.drawPeriod,
        items,
        validationById: {},
    }, request, entitlements);
}

async function readStoredExploreValidationArtifact(
    artifact: ExploreArtifact,
    itemId: string,
) {
    let selectedArtifact = artifact;
    if (isPartitionedExploreArtifact(artifact)) {
        const partitionIndex = partitionIndexForItemId(artifact, itemId);
        if (partitionIndex === null) return null;
        const [group] = await matrixAnalysisProgressStore.readExploreGroupIndexes(
            artifact.partitioned.job,
            [partitionIndex],
        ) as ExploreArtifact[];
        if (!group) return null;
        selectedArtifact = group;
    }
    const sourceA = selectedArtifact.validationById[itemId]?.sourceA;
    if (!sourceA || Array.isArray(sourceA.referenceNumbers)) return selectedArtifact;
    const history = await getMatrixHistory(selectedArtifact.lottery,50);
    return enrichExploreValidationReferenceNumbers(selectedArtifact,itemId,history);
}
const matrixStatusRoutes = createMatrixStatusRoutes({
    requireMember: authorization => matrixMemberAuth.requireMember(authorization),
    readAnalysis: (kind,lottery,drawPeriod) => kind === 'explore' || kind === 'tianyan'
        ? readCompletedMatrixAnalysis(kind,lottery,drawPeriod)
        : analysisStore.readAnalysis(kind,lottery,drawPeriod),
    listConfigs: memberId => matrixCustomStatusStore.list(memberId),
});
const matrixExploreRoutes = createMatrixExploreRoutes({
    requireMember: authorization => matrixMemberAuth.requireMember(authorization),
    resolveDrawPeriod: async (lottery,exploreDateOffset) => {
        const history = await getMatrixHistory(lottery,exploreDateOffset + 1);
        return history[exploreDateOffset]?.period;
    },
    readAnalysis: async (kind,lottery,drawPeriod) => {
        const artifact = await analysisStore.readAnalysis('explore',lottery,drawPeriod,analysisVersionForDrawPeriod(drawPeriod));
        return artifact === null ? null : { ...artifact,data:artifact.data as ExploreArtifact };
    },
    filterPartitionedExplore: filterStoredExploreArtifact,
    readPartitionedValidationArtifact: readStoredExploreValidationArtifact,
});
const matrixTianyanRoutes = createMatrixTianyanRoutes({
    requireMember: authorization => matrixMemberAuth.requireMember(authorization),
    readAnalysis: async (kind,lottery,drawPeriod) => {
        const artifact = await readCompletedMatrixAnalysis('tianyan',lottery,drawPeriod);
        return artifact === null ? null : { ...artifact,data:artifact.data as TianyanArtifact };
    },
});
const matrixTiangongRoutes = createMatrixTiangongRoutes({
    requireMember: authorization => matrixMemberAuth.requireMember(authorization),
    readAnalysis: async (kind,lottery,drawPeriod) => {
        const artifact = await readCompletedMatrixAnalysis('tiangong',lottery,drawPeriod);
        return artifact === null ? null : { ...artifact,data:artifact.data as TiangongArtifact };
    },
});
function authorizationHeader(event: { headers?: Record<string,string|undefined> } | undefined) { return event?.headers?.authorization ?? event?.headers?.Authorization; }

export const scheduledLotteryRefresh = async () => systemJobTracker.run('matrix-649-refresh-v2', '大樂透', async () => {
    const results = await refreshActiveSources();
    const failures = results.filter(result => !result.ok);
    if (failures.length) throw new Error('排程爬蟲失敗：' + failures.map(result => result.sourceId + ' ' + result.error).join('；'));
    return { statusCode: 200,analysis:[] };
});

export const scheduledLotterySourceRefresh = async (event: { payload?: { sourceId?: string } }) => {
    const sourceId = event.payload?.sourceId;
    if (!sourceId) throw new Error('彩種排程缺少 sourceId');
    const lotteryBySource: Record<string,'今彩539'|'天天樂'|'六合彩'|'大樂透'> = { taiwan539:'今彩539',sc888:'天天樂',nfdhk:'六合彩',taiwan649:'大樂透' };
    const jobBySource: Record<string,string> = { taiwan539:'matrix-539-refresh-v2',sc888:'matrix-fantasy5-refresh-v2',nfdhk:'matrix-marksix-refresh-v2',taiwan649:'matrix-649-refresh-v2' };
    const lottery=lotteryBySource[sourceId];
    if(!lottery) throw new Error('未知彩種排程來源');
    return systemJobTracker.run(jobBySource[sourceId],lottery,async()=>{
        const result = await fetchSource(sourceId);
        if (!result.updated) console.warn('彩種排程來源尚未更新', sourceId, result.data.period);
        return { statusCode: 200,analysis:null };
    });
};

export const scheduledMatrixAnalysisRefresh = async (event: { scheduledTime?: string; payload?: { lottery?: '今彩539'|'天天樂'|'六合彩'|'大樂透'; sourceId?: string; refreshAll?: boolean; refreshHour?: number } }) => {
    const trackedLottery=event.payload?.lottery ?? selectAnalysisLottery(event.scheduledTime);
    const jobByLottery: Record<string,string>={'今彩539':'matrix-539-refresh-v2','天天樂':'matrix-fantasy5-refresh-v2','六合彩':'matrix-marksix-refresh-v2','大樂透':'matrix-649-refresh-v2'};
    return systemJobTracker.run(jobByLottery[trackedLottery],trackedLottery,async(reportStage)=>{
        const refreshHour = event.payload?.refreshHour;
        let refresh: (() => Promise<unknown>) | undefined;
        if (refreshHour !== undefined && isTaipeiRefreshWindow(event.scheduledTime,refreshHour)) {
            if (event.payload?.refreshAll) refresh = () => scheduledLotteryRefresh();
            else if (event.payload?.sourceId) refresh = () => scheduledLotterySourceRefresh({payload:{sourceId:event.payload.sourceId}});
        }
        const limits = matrixWorkerLimits(trackedLottery, Boolean(refresh));
        const cycle = await runRefreshThenAnalysis(
            refresh,
            () => matrixAnalysisPipeline.ensureCurrent(trackedLottery, { ...limits, reportStage }),
        );
        return {statusCode:200,refresh:cycle.refresh,result:cycle.analysis};
    });
};

export const scheduledFantasy5MatrixAnalysisRefresh = async (event: { scheduledTime?: string } = {}) => (
    scheduledMatrixAnalysisRefresh({
        scheduledTime:event.scheduledTime,
        payload:{lottery:'天天樂',sourceId:'sc888',refreshHour:18},
    })
);

export const scheduledHistoricalBackfill = async (event: { payload?: { sourceId?: string } }) => {
    const sourceId=event.payload?.sourceId;
    if(!sourceId) throw new Error('完整回填排程缺少 sourceId');
    await completeHistoricalSource(sourceId);
    return { statusCode: 200 };
};

export const scheduledHistoricalAudit = async () => {
    const required=['taiwan539','sc888','nfdhk','taiwan649'];
    const jobs=await getHistoricalMaintenanceStatus();
    const incomplete=required.filter(sourceId=>!jobs.some(job=>job.sourceId===sourceId&&job.status==='complete'));
    if(incomplete.length) throw new Error('完整回填尚未完成：'+incomplete.join(','));
    const audit=await getMatrixAudit();
    const failures=Object.entries(audit).filter(([,item])=>item.duplicatePeriodCount>0||item.invalidRecords>0).map(([lottery,item])=>lottery+' 重複'+item.duplicatePeriodCount+' 格式異常'+item.invalidRecords);
    if(failures.length) throw new Error('完整回填稽核失敗：'+failures.join('；'));
    return { statusCode: 200 };
};

export const scheduledNfdProductionAudit = async () => {
    const coverage = (await getMatrixCoverage())['六合彩'];
    throw new Error('NFD_COVERAGE_PRODUCTION_AUDIT ' + JSON.stringify({ total: coverage.total, thresholds: coverage.thresholds, missing: coverage.missing }));
};


export const handler = router({
    'GET /api/_healthcheck': [async () => json({ message: 'Success' })],
    'POST /api/fetch/:source': [async ({ params }) => { try { const result = await fetchSource(params.source); return json(result); } catch (e) { const message = e instanceof Error ? e.message : '抓取失敗'; console.warn('crawler failure', params.source, message); return json({ ok: false, error: message }); } }],
    'GET /api/records/:lottery': [async ({ params }) => { try { return json({ items: await listRecords(decodeURIComponent(params.lottery)) }); } catch (e) { const message = e instanceof Error ? e.message : '讀取資料庫失敗'; return error(message, 500); } }],
    'POST /api/backfill/:year': [async ({ params }) => { try { return json(await backfillYear(params.year)); } catch (e) { const message = e instanceof Error ? e.message : '歷史回填失敗'; return json({ ok: false, error: message }); } }],
    'POST /api/backfill-range/:startYear/:endYear': [async ({ params }) => { try { return json(await backfillRange(params.startYear, params.endYear)); } catch (e) { const message = e instanceof Error ? e.message : '歷史範圍回填失敗'; return json({ ok: false, error: message }); } }],
    'POST /api/backfill-source/:source/:startYear/:endYear': [async ({ params }) => { try { return json(await backfillSourceRange(params.source, params.startYear, params.endYear)); } catch (e) { const message = e instanceof Error ? e.message : '單一來源回填失敗'; return json({ ok: false, error: message }); } }],

    'GET /api/matrix/latest/:lottery': [async ({ params }) => { try { return json({ item: await getMatrixLatest(decodeURIComponent(params.lottery)) }); } catch (e) { const message = e instanceof Error ? e.message : 'Matrix latest 讀取失敗'; return error(message, 400); } }],
    'GET /api/matrix/history/:lottery': [async ({ params, query }) => { try { return json({ items: await getMatrixHistory(decodeURIComponent(params.lottery), Number(query.limit ?? 100)) }); } catch (e) { const message = e instanceof Error ? e.message : 'Matrix history 讀取失敗'; return error(message, 400); } }],
    'GET /api/matrix/coverage': [async () => { try { return json({ coverage: await getMatrixCoverage() }); } catch (e) { const message = e instanceof Error ? e.message : 'Matrix coverage 讀取失敗'; return error(message, 500); } }],
    'GET /api/matrix/audit': [async () => { try { return json({ audit: await getMatrixAudit() }); } catch (e) { const message = e instanceof Error ? e.message : 'Matrix audit 讀取失敗'; return error(message, 500); } }],
    'POST /api/matrix/algorithm/explore': [async ({ body,event }) => { const response = await matrixExploreRoutes.list({ authorization:authorizationHeader(event),body }); return json(response.body,response.status); }],
    'POST /api/matrix/algorithm/explore/validation': [async ({ body,event }) => { const response = await matrixExploreRoutes.validation({ authorization:authorizationHeader(event),body }); return json(response.body,response.status); }],
    'POST /api/matrix/algorithm/tianyan': [async ({ body,event }) => { const response = await matrixTianyanRoutes.list({ authorization:authorizationHeader(event),body }); return json(response.body,response.status); }],
    'POST /api/matrix/algorithm/tianyan/validation': [async ({ body,event }) => { const response = await matrixTianyanRoutes.validation({ authorization:authorizationHeader(event),body }); return json(response.body,response.status); }],
    'POST /api/matrix/algorithm/tiangong': [async ({ body,event }) => { const response = await matrixTiangongRoutes.list({ authorization:authorizationHeader(event),body }); return json(response.body,response.status); }],
    'POST /api/matrix/algorithm/tiangong/validation': [async ({ body,event }) => { const response = await matrixTiangongRoutes.validation({ authorization:authorizationHeader(event),body }); return json(response.body,response.status); }],
    'GET /api/matrix/status/settings': [async ({ event }) => { const response = await matrixCustomStatusRoutes.list({ authorization:authorizationHeader(event),body:{} }); return json(response.body,response.status); }],
    'POST /api/matrix/status/settings': [async ({ body,event }) => { const response = await matrixCustomStatusRoutes.save({ authorization:authorizationHeader(event),body }); return json(response.body,response.status); }],
    'POST /api/matrix/status/settings/reset': [async ({ body,event }) => { const response = await matrixCustomStatusRoutes.reset({ authorization:authorizationHeader(event),body }); return json(response.body,response.status); }],
    'POST /api/matrix/status': [async ({ body,event }) => { const response = await matrixStatusRoutes.get({ authorization:authorizationHeader(event),body }); return json(response.body,response.status); }],
    'GET /api/matrix/algorithm/cases': [async () => { try { return json(await runMatrixAlgorithmCaseChecks()); } catch (e) { const message = e instanceof Error ? e.message : 'Matrix 案例驗證失敗'; return error(message, 400); } }],
    'POST /api/member-online/start': [async ({ event }) => { try { const member=await matrixMemberAuth.requireMember(authorizationHeader(event)); return json(await memberOnlineService.start(member.memberId)); } catch (e) { const value=e as { code?:string;status?:number;message?:string }; return error(value.code ?? value.message ?? 'MEMBER_ONLINE_START_FAILED',value.status ?? 500); } }],
    'POST /api/member-online/end': [async ({ body,event }) => { try { const member=await matrixMemberAuth.requireMember(authorizationHeader(event)); const sessionId=String((body as {sessionId?:unknown})?.sessionId ?? ''); if(!sessionId) return error('MEMBER_ONLINE_SESSION_REQUIRED',400); return json(await memberOnlineService.end(member.memberId,sessionId)); } catch (e) { const value=e as { code?:string;status?:number;message?:string }; return error(value.code ?? value.message ?? 'MEMBER_ONLINE_END_FAILED',value.status ?? 500); } }],
    'POST /api/matrix/tongxing': [async ({ body }) => { try { return json(await runTongXing(body)); } catch (e) { const message = e instanceof Error ? e.message : 'Matrix 同星執行失敗'; return error(message, 400); } }],
    'POST /api/matrix/number-reference': [async ({ body }) => { try { return json(await runNumberReference(body)); } catch (e) { const message = e instanceof Error ? e.message : '號碼對照單執行失敗'; return error(message, 400); } }],
    'GET /api/source-inspect/brightstream': [async () => json(await inspectBrightstreamHistory())],
    'GET /api/source-inspect/brightstream-marksix-deep': [async () => json(await inspectBrightstreamMarkSixDeep())],
    'GET /api/source-inspect/nfd-db': [async () => json(await inspectNfdDatabaseFiles())],
    'GET /api/source-inspect/nfd-date-sources': [async () => json(await inspectNfdNativeDateSources())],
    'GET /api/source-inspect/hk-history-candidates': [async () => json(await inspectHkHistoryCandidates())],
    'GET /api/source-inspect/lotto8-history': [async () => json(await inspectLotto8HistoryOnly())],
    'GET /api/source-inspect/nfd-lotto8-history-map': [async () => json(await inspectNfdLotto8HistoryMap())],

    ...realtimeSubscriptionRoutes,
})
