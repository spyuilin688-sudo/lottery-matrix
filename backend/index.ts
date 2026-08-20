import { router, json, error } from '@appdeploy/sdk';
import { backfillRange, backfillSourceRange, backfillYear, completeHistoricalSource, fetchSource, getHistoricalMaintenanceStatus, getMatrixAudit, getMatrixCoverage, getMatrixHistory, getMatrixLatest, inspectBrightstreamHistory, inspectBrightstreamMarkSixDeep, inspectHkHistoryCandidates, inspectLotto8HistoryOnly, inspectNfdDatabaseFiles, inspectNfdLotto8HistoryMap, inspectNfdNativeDateSources, listRecords, refreshActiveSources } from './scraper';

import { notifySubscribers, realtimeSubscriptionRoutes } from './realtime-subscribers';
import { readCompletedMatrixResult } from './matrix-result-store';
import { runMatrixAlgorithmCaseChecks } from './matrix-algorithm-cases';
import { runNumberReference, runTongXing } from './matrix-tools';

export const scheduledLotteryRefresh = async () => {
    const results = await refreshActiveSources();
    const failures = results.filter(result => !result.ok);
    if (failures.length) throw new Error('排程爬蟲失敗：' + failures.map(result => result.sourceId + ' ' + result.error).join('；'));
    return { statusCode: 200 };
};

export const scheduledLotterySourceRefresh = async (event: { payload?: { sourceId?: string } }) => {
    const sourceId = event.payload?.sourceId;
    if (!sourceId) throw new Error('彩種排程缺少 sourceId');
    const result = await fetchSource(sourceId);
    if (!result.updated) console.warn('彩種排程來源尚未更新', sourceId, result.data.period);
    return { statusCode: 200 };
};

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
    'POST /api/matrix/algorithm/explore': [async ({ body }) => { try { const result = await readCompletedMatrixResult(body); return result === null ? error('Matrix 已完成結果不存在', 404) : json(result); } catch (e) { const message = e instanceof Error ? e.message : 'Matrix 已完成結果讀取失敗'; return error(message, 400); } }],
    'GET /api/matrix/algorithm/cases': [async () => { try { return json(await runMatrixAlgorithmCaseChecks()); } catch (e) { const message = e instanceof Error ? e.message : 'Matrix 案例驗證失敗'; return error(message, 400); } }],
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